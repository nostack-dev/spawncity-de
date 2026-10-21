// Dogs and cats of world_procedural_population.mjs on the native renderer:
// 20 (12 on phones) seeded animals walk their wandering loops around the
// neighbourhood anchor (same hash, radius, speed and wobble as production,
// on the shared Date.now() clock), with the same body / head / four swinging
// legs (walk vs trot gait), coat colours and sizes. A shot kills one: it
// rolls over onto its side, away from the shot, and is gone after 25 s; a
// new one wanders in where nobody sees it appear. Explosions kill animals in
// reach. Every other two minutes animal #1 is the black cat: shoot it and it
// charges at 11 m/s, hissing and yowling, leaps at 1.6 m, and that is that.
import {worldOption,WORLD_OPTIONS_EVENT} from "./world_options.mjs";
import {playAnimal} from "./animal_audio.mjs";
import {nativeOsmProjector} from "./native_osm_projector.mjs";
import {syncInstanced} from "./native_instanced.mjs";
export const NATIVE_ANIMALS_VERSION="native-dogs-cats-black-cat-v1";
const MOBILE=/(?:android|iphone|ipad|ipod|macintosh.*mobile)/i.test(globalThis.navigator?.userAgent||"");
const COUNT=MOBILE?12:20,TORSO_UP=.11,GROUND_OFF=.36,ENTRY_M=110;
const DOG_COLORS=[0x8a6a4a,0xc49a5a,0x3b2c22,0xe8dcc8,0x6e5a46],CAT_COLORS=[0x8d8d8d,0xd88a3a,0x5b5048,0xe9e2d6];
const LEG_HIPS=[[.24,.09],[.24,-.09],[-.24,.09],[-.24,-.09]],GAIT_WALK=[.25,.75,0,.5],GAIT_TROT=[0,.5,.5,0];
let game=null,installed=false,seed=0,anchor=[0,0],drawn=false,catAttack=null,lastAt=performance.now();
const animals=Array.from({length:COUNT},()=>({shown:false,pose:null,dead:null,gait:0,m:null}));
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
function hashText(text){let h=2166136261;for(const c of String(text||"")){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const u01=(s,salt)=>hashText(`${s}:${salt}`)/4294967295,range=(s,salt,a,b)=>a+(b-a)*u01(s,salt);
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
const blackCatActive=()=>Math.floor(Date.now()/120000)%2===0;
function speciesOf(i){if(i===1&&(blackCatActive()||catAttack))return"black-cat";return i%3===2?"cat":"dog";}
const allowed=i=>speciesOf(i)==="dog"?worldOption("dogs"):worldOption("cats");
function colorOf(i){const sp=speciesOf(i),s=hashText(`animal-color:${i}`);return hex(sp==="black-cat"?0x0d0d0f:sp==="cat"?CAT_COLORS[s%CAT_COLORS.length]:DOG_COLORS[s%DOG_COLORS.length]);}
// ------------------------------------------------------------------ geometry (production quadruped)
function G(){return {p:[],n:[],c:[]};}
function rotY(v,a){const c=Math.cos(a),s=Math.sin(a);return [v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];}
function box(b,[sx,sy,sz],[x,y,z],ry=0){const h=[sx/2,sy/2,sz/2],F=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]]],[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,1,-1],[-1,-1,-1],[-1,-1,1],[-1,1,1]]],[[0,1,0],[[1,1,-1],[-1,1,-1],[-1,1,1],[1,1,1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]];
  for(const [n,q] of F){const v=q.map(k=>{const r=rotY([k[0]*h[0],k[1]*h[1],k[2]*h[2]],ry);return [r[0]+x,r[1]+y,r[2]+z];}),nn=rotY(n,ry);for(const i of [0,1,2,0,2,3]){b.p.push(...v[i]);b.n.push(...nn);b.c.push(1,1,1);}}}
function cone(b,r,h,[x,y,z],seg=4){for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,A=[x+Math.cos(a0)*r,y+Math.sin(a0)*r,z-h/2],B=[x+Math.cos(a1)*r,y+Math.sin(a1)*r,z-h/2],T=[x,y,z+h/2];
  const n=[Math.cos((a0+a1)/2),Math.sin((a0+a1)/2),.4];for(const v of [A,B,T]){b.p.push(...v);b.n.push(...n);b.c.push(1,1,1);}}}
function dodeca(b,r,[x,y,z]){const t=(1+Math.sqrt(5))/2,q=1/t,V=[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1],[0,-q,-t],[0,-q,t],[0,q,-t],[0,q,t],[-q,-t,0],[-q,t,0],[q,-t,0],[q,t,0],[-t,0,-q],[t,0,-q],[-t,0,q],[t,0,q]];
  const I=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];
  const nv=v=>{const l=Math.hypot(...v);return v.map(a=>a/l*r);};
  for(let i=0;i<I.length;i+=3){let a=nv(V[I[i]]),c=nv(V[I[i+1]]),d=nv(V[I[i+2]]);const e1=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],e2=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];let n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
    const ctr=[a[0]+c[0]+d[0],a[1]+c[1]+d[1],a[2]+c[2]+d[2]];if(n[0]*ctr[0]+n[1]*ctr[1]+n[2]*ctr[2]<0){[c,d]=[d,c];n=n.map(v=>-v);}const l=Math.hypot(...n)||1;n=n.map(v=>v/l);
    for(const v of [a,c,d]){b.p.push(v[0]+x,v[1]+y,v[2]+z);b.n.push(...n);b.c.push(1,1,1);}}}
const f32=b=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)});
const BODY=(()=>{const b=G();box(b,[.66,.26,.27],[0,0,0]);box(b,[.3,.055,.055],[-.44,0,.1],-.6);box(b,[.16,.16,.2],[.3,0,.12],.5);return f32(b);})();
const HEAD=(()=>{const b=G();dodeca(b,.15,[0,0,0]);box(b,[.15,.1,.09],[.13,0,-.04]);cone(b,.045,.11,[-.02,.08,.14]);cone(b,.045,.11,[-.02,-.08,.14]);return f32(b);})();
const LEG=(()=>{const b=G();box(b,[.075,.075,.27],[0,0,-.135]);return f32(b);})();
// ------------------------------------------------------------------ matrices
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
const RY=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
const RX=a=>{const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];};
const S=s=>[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1];
function poseMatrices(x,y,z,yaw,sc,speed,gait,{dead=0,roll=1,leap=0}={}){
  let bodyM=mul(T(x,y,z),RZ(yaw));if(leap)bodyM=mul(bodyM,RY(-leap));if(dead)bodyM=mul(bodyM,RX(roll*dead*Math.PI/2));bodyM=mul(bodyM,S(sc));
  const trot=speed>2.2,amp=dead?0:Math.min(.55,speed*.38),offs=trot?GAIT_TROT:GAIT_WALK,bob=dead?0:Math.abs(Math.sin(gait*Math.PI*2*2))*.025*Math.min(1,speed);
  const legs=LEG_HIPS.map(([hx,hy],k)=>{const swing=dead?.35*(k<2?1:-1):amp*Math.sin((gait+offs[k])*Math.PI*2);return mul(bodyM,mul(T(hx,hy,TORSO_UP-.1+bob),RY(swing)));});
  return {body:mul(bodyM,T(0,0,TORSO_UP+bob)),head:mul(bodyM,T(.43,0,.16+TORSO_UP+bob)),legs};
}
// ------------------------------------------------------------------ motion
function motion(i){const a=animals[i];if(a.m)return a.m;const s=hashText(`${seed}:animal:${i}`),radius=range(s,1,13,58);return a.m={radius,omega:range(s,2,.55,1.45)/radius,phase:range(s,3,0,Math.PI*2),wobbleOmega:range(s,4,.12,.3),wobbleRadius:range(s,5,1.2,3.5),baseScale:range(s,6,.72,1.18)};}
function pathAt(m,t){const a=t*m.omega+m.phase,w=Math.sin(t*m.wobbleOmega+m.phase)*m.wobbleRadius;return [anchor[0]+Math.cos(a)*m.radius+Math.cos(a*2.3)*w,anchor[1]+Math.sin(a*.92)*m.radius*.72+Math.sin(a*1.7)*w];}
function unseen(x,y){const cam=game?.world?.camera;if(!cam?.eye)return true;const e=cam.eye,d=[x-e[0],y-e[1]],dl=Math.hypot(...d);if(dl>ENTRY_M)return true;const f=[cam.target[0]-e[0],cam.target[1]-e[1]],fl=Math.hypot(...f)||1;return (d[0]*f[0]+d[1]*f[1])/(dl*fl||1)<Math.cos(Math.min(1.4,(Number(cam.fov)||1.2)*.75));}
function playerHead(){const W=globalThis.__arondightWalkMode,p=W?.position;if(game?.mode==="foot"&&p)return {x:p.x,y:p.y,z:p.z+.7};const e=game?.world?.camera?.eye;return e?{x:e[0],y:e[1],z:e[2]}:null;}
function killAnimal(i,{direct=false,dir=[0,0,0]}={}){
  const a=animals[i],p=a.pose;if(!p||a.dead)return false;const sp=speciesOf(i);
  if(sp==="black-cat"){if(!direct)return false;if(!catAttack){catAttack={i,start:performance.now(),x:p.x,y:p.y,z:p.z,yaw:p.yaw,phase:"charge"};try{playAnimal("hiss");}catch{}setData("blackCat","charging");}return true;}
  const fx=Math.cos(p.yaw),fy=Math.sin(p.yaw),side=(dir[0]*-fy+dir[1]*fx)>=0?1:-1;
  a.dead={at:performance.now(),roll:-side};try{playAnimal(sp==="cat"?"cat":"dog");}catch{}
  try{window.dispatchEvent(new CustomEvent("arondight:world-kill",{detail:{id:`animal-${i}`,kind:"animal",species:sp,network:false,local:true}}));}catch{}
  return true;
}
function setData(k,v){const el=globalThis.document?.getElementById?.("viewport");if(el)el.dataset[k]=String(v);}
function stepCat(now,dt){
  const c=catAttack;if(!c)return;if(!worldOption("cats")){catAttack=null;return;}
  if(c.phase==="leave"){c.x+=Math.cos(c.awayYaw)*1.3*dt;c.y+=Math.sin(c.awayYaw)*1.3*dt;c.yaw=c.awayYaw;c.z=ground(c.x,c.y)+GROUND_OFF;const h=playerHead();if(!h||Math.hypot(h.x-c.x,h.y-c.y)>28||now-c.leaveAt>9000){catAttack=null;setData("blackCat","idle");}return;}
  const h=playerHead();if(!h||globalThis.__arondightPlayerDamageModel?.dead){catAttack=null;setData("blackCat","idle");return;}
  const dx=h.x-c.x,dy=h.y-c.y,d=Math.hypot(dx,dy);c.yaw=Math.atan2(dy,dx);
  if(c.phase==="charge"){if(now-(c.lastCry||0)>780){c.lastCry=now;c.cries=(c.cries||0)+1;try{playAnimal(c.cries%2?"yowl":"hiss");}catch{}}
    const step=Math.min(d,11*dt);c.x+=dx/(d||1)*step;c.y+=dy/(d||1)*step;c.z=ground(c.x,c.y)+GROUND_OFF+Math.abs(Math.sin(now/55))*.12;
    if(d<1.6){c.phase="leap";c.leapAt=now;c.fx=c.x;c.fy=c.y;c.fz=c.z;try{playAnimal("screech");}catch{}}if(now-c.start>25000){catAttack=null;setData("blackCat","idle");}}
  else if(c.phase==="leap"){const t=Math.min(1,(now-c.leapAt)/340);c.x=c.fx+(h.x-c.fx)*t;c.y=c.fy+(h.y-c.fy)*t;c.z=Math.max(ground(c.x,c.y)+.18,c.fz+(h.z-.05-c.fz)*t+Math.sin(t*Math.PI)*.55);
    if(t>=1){globalThis.__arondightPlayerDamageModel?.damage?.(100000,"black-cat");try{window.dispatchEvent(new CustomEvent("arondight:black-cat-kill"));}catch{}setData("blackCat","killed-player");
      c.phase="leave";c.leaveAt=now;c.z=ground(c.x,c.y)+GROUND_OFF;c.awayYaw=c.yaw+Math.PI+(Math.random()-.5)*.8;}}
}
// ------------------------------------------------------------------ hits
export function hitNativeAnimals(origin,dir,range){
  let best=null,bestT=range;
  animals.forEach((a,i)=>{const p=a.pose;if(!a.shown||!p||a.dead)return;const sc=p.sc,cz=p.z;const ox=p.x-origin[0],oy=p.y-origin[1],oz=cz-origin[2],t=ox*dir[0]+oy*dir[1]+oz*dir[2];if(t<0||t>bestT)return;
    const px=origin[0]+dir[0]*t-p.x,py=origin[1]+dir[1]*t-p.y,pz=origin[2]+dir[2]*t-cz,ca=Math.cos(p.yaw),sa=Math.sin(p.yaw),lx=px*ca+py*sa,ly=-px*sa+py*ca;
    if((Math.abs(lx)<.4*sc&&Math.abs(ly)<.16*sc&&Math.abs(pz)<.22*sc)||Math.hypot(lx-.43*sc,ly,pz-.16*sc)<.18*sc){best={i,t};bestT=t;}});
  return best?{kind:"animal",index:best.i,t:best.t,point:[origin[0]+dir[0]*best.t,origin[1]+dir[1]*best.t,origin[2]+dir[2]*best.t]}:null;
}
export function shootNativeAnimal(index,dir=[0,0,0]){return killAnimal(index,{direct:true,dir});}
// ------------------------------------------------------------------ per frame
export function tickNativeAnimals(now=performance.now()){
  const r=game?.world?.renderer;if(!r?.upsert||!seed)return;const dt=Math.min(.1,Math.max(0,(now-lastAt)/1000));lastAt=now;stepCat(now,dt);
  const epoch=Date.now()/1000,bodies=[],heads=[],legs=[],tb=[],tl=[];
  for(let i=0;i<COUNT;i++){const a=animals[i],m=motion(i),sp=speciesOf(i),sc=sp==="dog"?m.baseScale:m.baseScale*.62;
    if(!allowed(i)){a.shown=false;a.pose=null;a.dead=null;continue;}
    if(a.dead&&(now-a.dead.at)/1000>25){a.shown=false;a.pose=null;a.dead=null;}
    const col=colorOf(i);let M=null;
    if(catAttack&&catAttack.i===i){const c=catAttack,cs=c.phase==="leave"?1.3:11;a.gait+=cs*dt/.4;a.pose={x:c.x,y:c.y,z:c.z,yaw:c.yaw,sc:.62};a.shown=true;M=poseMatrices(c.x,c.y,c.z-TORSO_UP*.62,c.yaw,.62,cs,a.gait,{leap:c.phase==="leap"?.5:0});}
    else{const [px,py]=pathAt(m,epoch);
      if(!a.shown){if(!unseen(px,py))continue;a.shown=true;a.pose=null;}
      if(a.dead&&a.pose){const k=Math.min(1,(now-a.dead.at)/600),p=a.pose;M=poseMatrices(p.x,p.y,ground(p.x,p.y)+.14*p.sc,p.yaw,p.sc,0,a.gait,{dead:k,roll:a.dead.roll});}
      else{const prior=a.pose,yaw=prior&&Math.hypot(px-prior.x,py-prior.y)>1e-4?Math.atan2(py-prior.y,px-prior.x):(prior?.yaw||0),gz=ground(px,py)+.25*sc,spd=prior&&dt>0?Math.hypot(px-prior.x,py-prior.y)/dt:0;
        a.gait+=spd*dt/(.55*sc);a.pose={x:px,y:py,z:gz+TORSO_UP*sc,yaw,sc};M=poseMatrices(px,py,gz,yaw,sc,Math.min(spd,6),a.gait);}}
    if(!M)continue;bodies.push(M.body);heads.push(M.head);for(const l of M.legs)legs.push(l);for(let k=0;k<2;k++)tb.push(col);for(let k=0;k<4;k++)tl.push(col);
  }
  if(!bodies.length){if(drawn){for(const [id,g] of [["animals/body",BODY],["animals/head",HEAD],["animals/legs",LEG]])syncInstanced(r,id,g,null);drawn=false;}return;}
  const pack=list=>{const o=new Float32Array(list.length*16);list.forEach((m,i)=>o.set(m,i*16));return o;},tints=list=>{const o=new Float32Array(list.length*4);list.forEach((c,i)=>o.set([...c,1],i*4));return o;};
  const bt=tints(tb.filter((_,k)=>k%2===0)),lt=tints(tl);
  const mat={material:{roughness:.85,frustumCulled:false}};
  syncInstanced(r,"animals/body",BODY,pack(bodies),{tints:bt,...mat});syncInstanced(r,"animals/head",HEAD,pack(heads),{tints:bt,...mat});syncInstanced(r,"animals/legs",LEG,pack(legs),{tints:lt,...mat});drawn=true;
  setData("ambientAnimals",String(bodies.length));
}
export function installNativeAnimals(runtime,snapshot){
  game=runtime;
  let key="training";anchor=[0,0];
  if(!snapshot?.training&&snapshot?.origin){const o=snapshot.origin,lat=Math.round(o.lat*1000)/1000,lon=Math.round(o.lon*1000)/1000;key=`${lat.toFixed(3)}:${lon.toFixed(3)}`;anchor=nativeOsmProjector(o).project(lon,lat);}
  seed=hashText(`arondight-world-pop:${key}`);for(const a of animals){a.m=null;a.shown=false;a.pose=null;a.dead=null;}catAttack=null;
  if(installed||typeof window==="undefined")return;installed=true;
  window.addEventListener("arondight:world-explosion",e=>{const d=e?.detail||{},p=d.position;if(!Array.isArray(p))return;const r=Math.max(1.5,Number(d.radiusM)||6),nuke=d.kind==="nuke";
    animals.forEach((a,i)=>{if(a.pose&&!a.dead&&Math.hypot(a.pose.x-p[0],a.pose.y-p[1])<(nuke?r*1.5:r*.9))killAnimal(i,{dir:[a.pose.x-p[0],a.pose.y-p[1],0]});});});
  window.addEventListener(WORLD_OPTIONS_EVENT,()=>{for(let i=0;i<COUNT;i++)if(!allowed(i)){animals[i].shown=false;animals[i].pose=null;}});
  window.addEventListener("arondight:world-reset",()=>{for(const a of animals){a.dead=null;a.shown=false;a.pose=null;}catAttack=null;});
  globalThis.__ambientAnimals={kill:i=>killAnimal(i),poses:()=>animals.map((a,i)=>a.pose&&!a.dead&&a.shown?{i,species:speciesOf(i),...a.pose}:null).filter(Boolean),
    hit:({index,direction=[0,0,1]}={})=>killAnimal(index,{direct:true,dir:direction}),version:NATIVE_ANIMALS_VERSION};
}
