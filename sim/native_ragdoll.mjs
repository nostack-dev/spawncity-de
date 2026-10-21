// Person ragdoll from world_person_ragdoll.mjs. Box3D human while the
// physics world is up, otherwise the same Verlet skeleton. A survivor gets
// up after the body settles. A corpse stays for 7 s. No Three.js.
import {humanPoint,HUMAN_BONE_INDEX as HB} from "./box3d_human.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";

export const NATIVE_RAGDOLL_VERSION="box3d-human-or-verlet-getup-v1";
const MOBILE_RE=/(?:android|iphone|ipad|ipod|macintosh.*mobile)/i;
const MAX_RAGDOLLS=MOBILE_RE.test(globalThis.navigator?.userAgent||"")?6:10;
const LIFE_MS=7000,FADE_MS=1800,GRAVITY=9.81,FIXED_STEP=1/60,MAX_STEPS=3,CONSTRAINT_ITERS=4;
const DAMPING=.992,BOUNCE=.16,FRICTION=.72,GETUP_MS=1150,SETTLE_MS=350,GETUP_AFTER_MS=2600;
const REST={
  pelvis:[0,0,.96],chest:[0,0,1.5],head:[0,0,1.74],
  lShoulder:[-.225,0,1.5],rShoulder:[.225,0,1.5],
  lElbow:[-.225,0,1.2],rElbow:[.225,0,1.2],
  lHand:[-.225,0,.93],rHand:[.225,0,.93],
  lHip:[-.1,0,.94],rHip:[.1,0,.94],
  lKnee:[-.1,0,.49],rKnee:[.1,0,.49],
  lFoot:[-.1,0,.05],rFoot:[.1,0,.05]
};
const FLOOR={pelvis:.11,chest:.13,head:.11,lShoulder:.07,rShoulder:.07,lElbow:.055,rElbow:.055,lHand:.045,rHand:.045,lHip:.08,rHip:.08,lKnee:.065,rKnee:.065,lFoot:.05,rFoot:.05};
const POINT_NAMES=Object.keys(REST);
const LINKS=[
  ["pelvis","chest"],["chest","head"],
  ["chest","lShoulder"],["lShoulder","lElbow"],["lElbow","lHand"],
  ["chest","rShoulder"],["rShoulder","rElbow"],["rElbow","rHand"],
  ["pelvis","lHip"],["lHip","lKnee"],["lKnee","lFoot"],
  ["pelvis","rHip"],["rHip","rKnee"],["rKnee","rFoot"],
  ["lShoulder","rShoulder"],["lHip","rHip"],
  ["lShoulder","pelvis"],["rShoulder","pelvis"],["chest","lHip"],["chest","rHip"],["lShoulder","rHip"],["rShoulder","lHip"],["head","lShoulder"],["head","rShoulder"]
];
const POINT_BONES={
  pelvis:[HB.pelvis,[0,0,0]],chest:[HB.neck_01,[0,0,0]],head:[HB.neck_01,[0,-.15,0]],
  lShoulder:[HB.upperarm_l,[0,0,0]],rShoulder:[HB.upperarm_r,[0,0,0]],
  lElbow:[HB.lowerarm_l,[0,0,0]],rElbow:[HB.lowerarm_r,[0,0,0]],
  lHand:[HB.lowerarm_l,[.37,0,0]],rHand:[HB.lowerarm_r,[-.37,0,0]],
  lHip:[HB.thigh_l,[0,0,0]],rHip:[HB.thigh_r,[0,0,0]],
  lKnee:[HB.calf_l,[0,0,0]],rKnee:[HB.calf_r,[0,0,0]],
  lFoot:[HB.calf_l,[-.445,0,0]],rFoot:[HB.calf_r,[.445,0,0]]
};
const CONSTRAINTS=LINKS.map(([a,b])=>{const av=REST[a],bv=REST[b];return{a,b,length:Math.hypot(av[0]-bv[0],av[1]-bv[1],av[2]-bv[2])};});
const ragdolls=[];
let serial=0,accumulator=0,lastNow=0,host=null,drawnSolid=false,drawnFade=false;
const hashText=text=>{let h=2166136261;for(const ch of String(text||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const noise=(seed,index)=>{let x=(seed+Math.imul(index+1,0x9e3779b1))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return(x>>>0)/0xffffffff*2-1;};
const rot=(x,y,yaw)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return[x*c-y*s,x*s+y*c];};
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
function frameBasis(right,up){
  const zlen=Math.hypot(up[0],up[1],up[2]);if(zlen<1e-6)return null;
  const z=[up[0]/zlen,up[1]/zlen,up[2]/zlen],d=right[0]*z[0]+right[1]*z[1]+right[2]*z[2];
  const rx=right[0]-z[0]*d,ry=right[1]-z[1]*d,rz=right[2]-z[2]*d,xlen=Math.hypot(rx,ry,rz);
  if(xlen<1e-6)return null;
  const x=[rx/xlen,ry/xlen,rz/xlen],y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  const m11=x[0],m12=y[0],m13=z[0],m21=x[1],m22=y[1],m23=z[1],m31=x[2],m32=y[2],m33=z[2],trace=m11+m22+m33;
  let qx,qy,qz,qw;
  if(trace>0){const s=.5/Math.sqrt(trace+1);qw=.25/s;qx=(m32-m23)*s;qy=(m13-m31)*s;qz=(m21-m12)*s;}
  else if(m11>m22&&m11>m33){const s=2*Math.sqrt(1+m11-m22-m33);qw=(m32-m23)/s;qx=.25*s;qy=(m12+m21)/s;qz=(m13+m31)/s;}
  else if(m22>m33){const s=2*Math.sqrt(1+m22-m11-m33);qw=(m13-m31)/s;qx=(m12+m21)/s;qy=.25*s;qz=(m23+m32)/s;}
  else{const s=2*Math.sqrt(1+m33-m11-m22);qw=(m21-m12)/s;qx=(m13+m31)/s;qy=(m23+m32)/s;qz=.25*s;}
  return {z,q:[qx,qy,qz,qw]};
}
function bodyPose(r){
  const pel=r.points.pelvis.p,chest=r.points.chest.p,l=r.points.lHip.p,rh=r.points.rHip.p;
  const basis=frameBasis([rh[0]-l[0],rh[1]-l[1],rh[2]-l[2]],[chest[0]-pel[0],chest[1]-pel[1],chest[2]-pel[2]]);
  if(!basis){
    const hx=rh[0]-l[0],hy=rh[1]-l[1];let yaw=Math.atan2(hy,hx);if(!Number.isFinite(yaw))yaw=0;yaw+=Math.PI/2;
    return {pos:[pel[0],pel[1],ground(pel[0],pel[1])],q:[0,0,Math.sin(yaw*.5),Math.cos(yaw*.5)]};
  }
  return {pos:[pel[0]-basis.z[0]*.96,pel[1]-basis.z[1]*.96,pel[2]-basis.z[2]*.96],q:basis.q};
}
function ground(x,y){const h=host?.world?.terrain?.heightAt?.(x,y);return Number.isFinite(h)?h:0;}
function view(){return typeof document==="undefined"?null:document.getElementById("viewport");}
function setData(key,value){const v=view();if(v)v.dataset[key]=String(value);}
function blank(){
  const points={};
  for(const name of POINT_NAMES)points[name]={p:[0,0,0],prev:[0,0,0]};
  return {points,active:false,born:0,expires:0,settledMs:0,recover:null,getup:null,box3d:null,id:"",seed:0};
}
function releaseBox(r){if(r.box3d){host?.rigids?.removeHuman?.(r.box3d);r.box3d=null;}}
function wake(r){
  if(r.recover){const p=r.points.pelvis.p;try{r.recover.onUp?.({x:p[0],y:p[1],yaw:0});}catch{}}
  releaseBox(r);r.recover=null;r.getup=null;r.active=false;
}
function choose(){
  let free=ragdolls.find(r=>!r.active);
  if(!free){
    while(ragdolls.length<MAX_RAGDOLLS)ragdolls.push(blank());
    free=ragdolls.find(r=>!r.active);
  }
  if(free)return free;
  const oldest=ragdolls.reduce((a,b)=>a.born<=b.born?a:b);
  wake(oldest);return oldest;
}
function readBox(r){
  const rigids=host?.rigids,h=rigids?.human?.(r.box3d),b3=rigids?.engine?.b3;
  if(!h||!b3){r.box3d=null;return false;}
  const pt=[0,0,0];
  for(const name of POINT_NAMES){
    const spec=POINT_BONES[name];
    if(!humanPoint(b3,h,spec[0],spec[1],pt))continue;
    const p=r.points[name].p,prev=r.points[name].prev;
    p[0]=pt[0];p[1]=pt[1];p[2]=pt[2];
    prev[0]=p[0];prev[1]=p[1];prev[2]=p[2];
  }
  let vmax=0;
  for(const body of h.bodies){
    if(b3.b3Body_IsAwake&&!b3.b3Body_IsAwake(body))continue;
    const v=b3.b3Body_GetLinearVelocity([0,0,0],body);
    vmax=Math.max(vmax,Math.hypot(v[0],v[1],v[2]));
  }
  r.settledMs=vmax<.06?r.settledMs+16:0;
  return true;
}
function floorPoint(point,lift){
  const z=ground(point.p[0],point.p[1])+lift;
  if(point.p[2]>=z)return;
  const vx=point.p[0]-point.prev[0],vy=point.p[1]-point.prev[1],vz=point.p[2]-point.prev[2];
  point.p[2]=z;point.prev[0]=point.p[0]-vx*FRICTION;point.prev[1]=point.p[1]-vy*FRICTION;point.prev[2]=point.p[2]+vz*BOUNCE;
}
function solve(r){
  for(let iter=0;iter<CONSTRAINT_ITERS;iter++){
    for(const c of CONSTRAINTS){
      const a=r.points[c.a].p,b=r.points[c.b].p,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],d=Math.hypot(dx,dy,dz)||1e-6,error=(d-c.length)/d*.5;
      a[0]+=dx*error;a[1]+=dy*error;a[2]+=dz*error;b[0]-=dx*error;b[1]-=dy*error;b[2]-=dz*error;
    }
    for(const name of POINT_NAMES)floorPoint(r.points[name],FLOOR[name]);
  }
}
function integrate(r,dt){
  const dt2=dt*dt;let kinetic=0;
  for(const name of POINT_NAMES){
    const point=r.points[name],p=point.p,prev=point.prev;
    const vx=(p[0]-prev[0])*DAMPING,vy=(p[1]-prev[1])*DAMPING,vz=(p[2]-prev[2])*DAMPING;
    prev[0]=p[0];prev[1]=p[1];prev[2]=p[2];
    p[0]+=vx;p[1]+=vy;p[2]+=vz-GRAVITY*dt2;
    kinetic+=vx*vx+vy*vy+vz*vz;floorPoint(point,FLOOR[name]);
  }
  solve(r);r.settledMs=kinetic<.00008?r.settledMs+dt*1000:0;
}
function kneelZ(name){
  if(name==="pelvis"||name.includes("Hip"))return .52;
  if(name==="chest"||name.includes("Shoulder"))return 1.02;
  if(name==="head")return 1.26;
  if(name.includes("Elbow"))return .78;
  if(name.includes("Hand"))return .55;
  if(name==="lKnee")return .07;
  if(name==="rKnee")return .5;
  return .05;
}
function beginGetup(r,now){
  releaseBox(r);
  const P=n=>r.points[n].p,px=P("pelvis")[0],py=P("pelvis")[1];
  const hx=P("rHip")[0]-P("lHip")[0],hy=P("rHip")[1]-P("lHip")[1];
  let yaw=Math.atan2(hy,hx);if(!Number.isFinite(yaw))yaw=0;
  const from={},kneel={},stand={},g=ground(px,py);
  for(const name of POINT_NAMES){
    const rest=REST[name],[rx,ry]=rot(rest[0],rest[1],yaw);
    stand[name]=[px+rx,py+ry,g+rest[2]];
    const fwd=name==="rKnee"||name==="rFoot"?.32:name==="lFoot"?-.3:0,[kx,ky]=rot(rest[0],fwd,yaw);
    kneel[name]=[px+kx,py+ky,g+kneelZ(name)];
    from[name]=P(name).slice();
  }
  r.getup={start:now,from,kneel,stand,yaw,x:px,y:py};
}
function stepGetup(r,now){
  const gu=r.getup,t=(now-gu.start)/GETUP_MS;
  for(const name of POINT_NAMES){
    const p=r.points[name].p;
    const next=t<.45?lerp(gu.from[name],gu.kneel[name],smooth(t/.45)):lerp(gu.kneel[name],gu.stand[name],smooth((t-.45)/.55));
    p[0]=next[0];p[1]=next[1];p[2]=next[2];
    const prev=r.points[name].prev;prev[0]=p[0];prev[1]=p[1];prev[2]=p[2];
  }
  if(t<1)return;
  const rec=r.recover;r.active=false;r.getup=null;r.recover=null;
  try{rec?.onUp?.({x:gu.x,y:gu.y,yaw:gu.yaw+Math.PI/2});}catch{}
}
export function installNativeRagdoll(game){host=game||host;}
export function spawnNativeRagdoll({position,yaw=0,impulse=[0,0,0],seed="",id="",recover=null}={}){
  if(!position)return false;
  const r=choose();if(!r)return false;
  const ox=Number(position[0])||0,oy=Number(position[1])||0,oz=Number(position[2])||0;
  const ix=Number(impulse?.[0])||0,iy=Number(impulse?.[1])||0,iz=Number(impulse?.[2])||0;
  const seedNumber=hashText(seed||id||String(++serial));
  for(let i=0;i<POINT_NAMES.length;i++){
    const name=POINT_NAMES[i],rest=REST[name],[rx,ry]=rot(rest[0],rest[1],yaw);
    const p=r.points[name].p,prev=r.points[name].prev;
    const boost=name==="chest"||name==="head"?1.15:name.includes("Hand")||name.includes("Foot")?1.28:1;
    p[0]=ox+rx;p[1]=oy+ry;p[2]=Math.max(oz,ground(ox+rx,oy+ry))+rest[2];
    const vx=ix*boost+noise(seedNumber,i*3)*.65,vy=iy*boost+noise(seedNumber,i*3+1)*.65,vz=iz*boost+1.1+Math.abs(noise(seedNumber,i*3+2))*.9;
    prev[0]=p[0]-vx*FIXED_STEP;prev[1]=p[1]-vy*FIXED_STEP;prev[2]=p[2]-vz*FIXED_STEP;
  }
  releaseBox(r);
  const rigids=host?.rigids;
  if(rigids?.createHuman){
    const rid=`ragdoll-${ragdolls.indexOf(r)}-${(++serial).toString(36)}`;
    const g=Math.max(oz,ground(ox,oy));
    if(rigids.createHuman(rid,{position:[ox,oy,g+.02],yaw,velocity:[ix,iy,iz+1.1],frictionTorque:8,hertz:0})){
      r.box3d=rid;rigids.pushHuman?.(rid,[0,0,0],6+Math.abs(noise(seedNumber,99))*10);
    }
  }
  const now=performance.now();
  r.active=true;r.born=now;r.expires=now+(recover?60000:LIFE_MS);r.seed=seedNumber;r.id=String(id||"");
  r.settledMs=0;r.recover=typeof recover?.onUp==="function"?recover:null;r.getup=null;
  setData("worldRagdollSpawns",(Number(view()?.dataset.worldRagdollSpawns)||0)+1);
  setData("worldRagdollLastId",r.id);
  setData("worldRagdollModel",r.box3d?"box3d-human-capsules-joint-friction":"articulated-character");
  return true;
}
export function tickNativeRagdoll(game,now=performance.now()){
  if(game)host=game;
  const dt=lastNow?Math.min(.08,Math.max(0,(now-lastNow)/1000)):FIXED_STEP;lastNow=now;
  accumulator+=dt;let steps=0;
  while(accumulator>=FIXED_STEP&&steps<MAX_STEPS){
    for(const r of ragdolls)if(r.active&&!r.getup&&!r.box3d)integrate(r,FIXED_STEP);
    accumulator-=FIXED_STEP;steps++;
  }
  if(steps===MAX_STEPS)accumulator=Math.min(accumulator,FIXED_STEP);
  let active=0;const solid=[],solidTint=[],fade=[],fadeTint=[];
  for(const r of ragdolls){
    if(!r.active)continue;
    if(now>=r.expires&&!r.recover){releaseBox(r);r.active=false;continue;}
    active++;
    if(r.box3d&&!r.getup)readBox(r);
    if(r.recover&&!r.getup&&(r.settledMs>SETTLE_MS||now-r.born>(r.recover.afterMs||GETUP_AFTER_MS)))beginGetup(r,now);
    if(r.getup){stepGetup(r,now);if(!r.active)continue;}
    const remaining=r.expires-now,alpha=r.recover?1:remaining<FADE_MS?Math.max(0,remaining/FADE_MS):1;
    const pose=bodyPose(r),pack=alpha<1?fade:solid,tint=alpha<1?fadeTint:solidTint;
    pack.push(...fromTRS(pose.pos,pose.q,[1,1,1]));tint.push(1,1,1,alpha);
  }
  setData("worldRagdolls",active);
  const renderer=host?.world?.renderer;if(!renderer?.upsert)return active;
  const paint=(id,data,tints,blend,flag)=>{
    if(!data.length){if(flag()){renderer.remove(id);return false;}return false;}
    const instances={transforms:new Float32Array(data),tints:new Float32Array(tints)};
    if(flag())renderer.updateInstances(id,instances);
    else renderer.upsert(id,{...ORIGINAL_HUMAN,instances,material:{doubleSided:true,castShadow:false,alphaMode:blend?"blend":"opaque"}});
    return true;
  };
  drawnSolid=paint("actors/ragdoll",solid,solidTint,false,()=>drawnSolid);
  drawnFade=paint("actors/ragdoll-fade",fade,fadeTint,true,()=>drawnFade);
  return active;
}
export function nativeRagdollStats(){return{active:ragdolls.filter(r=>r.active).length,pool:ragdolls.length,max:MAX_RAGDOLLS};}
