// Car death debris from world_car_explosion.mjs. Same part count, throw,
// bounce and layered burst. Drawn with the native renderer. No Three.js.
// The damage blast stays in native_ordnance; this file is only the wreck.
import {fromTRS} from "./native_render_math.mjs";

export const NATIVE_CAR_DEBRIS_VERSION="round-layered-v2";
const MOBILE_RE=/(?:android|iphone|ipad|ipod|macintosh.*mobile)/i;
const MAX=MOBILE_RE.test(globalThis.navigator?.userAgent||"")?4:7;
const PARTS=9,LIFE_MS=6500,FADE_MS=1400,BLAST_MS=920,GRAVITY=9.81,FLOOR_Z=.06;
const FIXED_STEP=1/60,MAX_STEPS=3,BOUNCE=.30,FRICTION=.76;
const pieces=[],bursts=[];
let serial=0,accumulator=0,lastNow=0,host=null;
const drawn={box:false,boxFade:false,wheel:false,wheelFade:false,burst:false,ring:false};
const hashText=text=>{let h=2166136261;for(const ch of String(text||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const noise=(seed,index)=>{let x=(seed+Math.imul(index+1,0x9e3779b1))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return(x>>>0)/0xffffffff*2-1;};
const rgb=hex=>[((hex>>16)&255)/255,((hex>>8)&255)/255,(hex&255)/255];
function geo(p){return{positions:new Float32Array(p),colors:new Float32Array(p.length).fill(1)};}
function box(){
  const p=[],x=.5,y=.5,z=.5;
  const add=(a,b,d,e)=>{for(const q of[a,b,d,a,d,e])p.push(...q);};
  add([-x,-y,-z],[-x,y,-z],[-x,y,z],[-x,-y,z]);
  add([x,y,-z],[x,-y,-z],[x,-y,z],[x,y,z]);
  add([x,-y,-z],[-x,-y,-z],[-x,-y,z],[x,-y,z]);
  add([-x,y,-z],[x,y,-z],[x,y,z],[-x,y,z]);
  add([-x,y,z],[x,y,z],[x,-y,z],[-x,-y,z]);
  add([-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z]);
  return geo(p);
}
function cylinderY(radius,height,seg){
  const p=[],h=height*.5;
  for(let i=0;i<seg;i++){
    const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2;
    const x0=Math.cos(a0)*radius,z0=Math.sin(a0)*radius,x1=Math.cos(a1)*radius,z1=Math.sin(a1)*radius;
    const b0=[x0,-h,z0],t0=[x0,h,z0],b1=[x1,-h,z1],t1=[x1,h,z1];
    for(const q of[b0,t0,t1,b0,t1,b1,[0,-h,0],b1,b0,[0,h,0],t0,t1])p.push(...q);
  }
  return geo(p);
}
function sphere(stacks,slices){
  const p=[],at=(i,j)=>{const v=i/stacks*Math.PI,u=j/slices*Math.PI*2;return[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];};
  for(let i=0;i<stacks;i++)for(let j=0;j<slices;j++){
    const a=at(i,j),b=at(i+1,j),d=at(i,j+1),e=at(i+1,j+1);
    for(const q of[a,b,e,a,e,d])p.push(...q);
  }
  return geo(p);
}
function ring(inner,outer,seg){
  const p=[];
  for(let i=0;i<seg;i++){
    const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const i0=[c0*inner,s0*inner,0],o0=[c0*outer,s0*outer,0],i1=[c1*inner,s1*inner,0],o1=[c1*outer,s1*outer,0];
    for(const q of[i0,o0,o1,i0,o1,i1])p.push(...q);
  }
  return geo(p);
}
const BOX=box(),WHEEL=cylinderY(.34,.22,8),BALL=sphere(6,8),RING=ring(.72,1.05,28);
function eulerXYZ(x,y,z){
  const c1=Math.cos(x*.5),c2=Math.cos(y*.5),c3=Math.cos(z*.5),s1=Math.sin(x*.5),s2=Math.sin(y*.5),s3=Math.sin(z*.5);
  return[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];
}
function mulQuat(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function axisAngle(axis,angle){const l=Math.hypot(axis[0],axis[1],axis[2])||1,s=Math.sin(angle*.5);return[axis[0]/l*s,axis[1]/l*s,axis[2]/l*s,Math.cos(angle*.5)];}
function normQuat(q){const l=Math.hypot(q[0],q[1],q[2],q[3])||1;return[q[0]/l,q[1]/l,q[2]/l,q[3]/l];}
function view(){return typeof document==="undefined"?null:document.getElementById("viewport");}
function setData(key,value){const v=view();if(v)v.dataset[key]=String(value);}
function blank(){return{active:false,born:0,expires:0,pos:[0,0,0],vel:[0,0,0],spin:[0,0,0],q:[0,0,0,1],scale:[1,1,1],color:[.47,.47,.47],wheel:false};}
function ensure(){
  while(pieces.length<MAX*PARTS)pieces.push(blank());
  while(bursts.length<MAX)bursts.push({active:false,born:0,expires:0,pos:[0,0,0]});
  setData("worldCarDebrisPool",pieces.length);setData("worldCarExplosionPool",MAX);setData("worldCarExplosionStyle","round-layered-v2");
}
function choosePieces(){
  const free=pieces.filter(p=>!p.active);
  if(free.length>=PARTS)return free.slice(0,PARTS);
  return[...pieces].sort((a,b)=>a.born-b.born).slice(0,PARTS);
}
function chooseBurst(){return bursts.find(b=>!b.active)||bursts.reduce((a,b)=>a.born<=b.born?a:b);}
function floor(p){
  if(p.pos[2]>=FLOOR_Z)return;
  p.pos[2]=FLOOR_Z;
  if(p.vel[2]<0)p.vel[2]=-p.vel[2]*BOUNCE;
  p.vel[0]*=FRICTION;p.vel[1]*=FRICTION;p.spin[0]*=.82;p.spin[1]*=.82;p.spin[2]*=.82;
  if(Math.abs(p.vel[2])<.15)p.vel[2]=0;
}
function step(dt){
  for(const p of pieces){
    if(!p.active)continue;
    p.vel[2]-=GRAVITY*dt;
    p.pos[0]+=p.vel[0]*dt;p.pos[1]+=p.vel[1]*dt;p.pos[2]+=p.vel[2]*dt;
    floor(p);
    const omega=Math.hypot(p.spin[0],p.spin[1],p.spin[2]);
    if(omega>.0001)p.q=normQuat(mulQuat(axisAngle(p.spin,omega*dt),p.q));
    p.vel[0]*=.997;p.vel[1]*=.997;p.vel[2]*=.997;
  }
}
const BURST_RGB={core:rgb(0xffe0a0),hot:rgb(0xff8a3c),shell:rgb(0xff5b2d),smoke:rgb(0x514d49),ring:rgb(0xffb35b)};
function burstPose(b,now){
  const duration=b.expires-b.born||1,t=Math.max(0,Math.min(1,(now-b.born)/duration)),ease=1-(1-t)**3;
  const yaw=t*.18,q=[0,0,Math.sin(yaw*.5),Math.cos(yaw*.5)];
  return[
    {pos:b.pos,scale:.42+2.9*ease,rgb:BURST_RGB.core,alpha:.98*(1-t)**.72},
    {pos:[b.pos[0],b.pos[1],b.pos[2]+.04],scale:.58+4.5*ease,rgb:BURST_RGB.hot,alpha:.76*(1-t)**1.05},
    {pos:[b.pos[0],b.pos[1],b.pos[2]+.02],scale:.75+6.9*ease,rgb:BURST_RGB.shell,alpha:.44*(1-t)**1.55},
    {pos:[b.pos[0],b.pos[1],b.pos[2]+.08+1.45*t],scale:.62+4.6*ease,rgb:BURST_RGB.smoke,alpha:.30*Math.sin(Math.PI*t)*(1-.18*t)},
    {pos:[b.pos[0],b.pos[1],FLOOR_Z+.035],scale:.82+8.8*ease,q,rgb:BURST_RGB.ring,alpha:.72*(1-t)**1.9,ring:true}
  ];
}
export function installNativeCarDebris(game){host=game||host;ensure();}
export function spawnNativeCarDebris({position,yaw=0,velocity=[0,0,0],color=0x777777,seed="",id=""}={}){
  if(!position)return false;
  ensure();
  const ox=Number(position[0])||0,oy=Number(position[1])||0,oz=Math.max(FLOOR_Z,Number(position[2])||0);
  const vx0=Number(velocity?.[0])||0,vy0=Number(velocity?.[1])||0,vz0=Number(velocity?.[2])||0;
  const seedNumber=hashText(seed||id||`${ox}:${oy}:${yaw}`),set=choosePieces(),body=rgb(Number(color)||0x777777),wheel=rgb(0x242424),now=performance.now();
  const c=Math.cos(yaw),s=Math.sin(yaw);
  for(let i=0;i<set.length;i++){
    const p=set[i],side=i%2?1:-1;
    const forward=i<2?(i===0?0:-.3):(i<6?(i<4?.8:-.8):noise(seedNumber,i)*.6);
    const lateral=i<2?0:side*(i<6?.72:.45),rx=forward*c-lateral*s,ry=forward*s+lateral*c;
    const blast=4.2+Math.abs(noise(seedNumber,i*5))*6.4,angle=yaw+noise(seedNumber,i*5+1)*1.9;
    p.pos[0]=ox+rx;p.pos[1]=oy+ry;p.pos[2]=oz+(i<2?.55:.35+Math.abs(noise(seedNumber,i*5+2))*.65);
    p.q=eulerXYZ(noise(seedNumber,i*7)*.4,noise(seedNumber,i*7+1)*.4,yaw+noise(seedNumber,i*7+2)*.25);
    p.vel[0]=vx0*.35+Math.cos(angle)*blast;p.vel[1]=vy0*.35+Math.sin(angle)*blast;p.vel[2]=vz0*.2+3.2+Math.abs(noise(seedNumber,i*5+3))*6.2;
    p.spin[0]=noise(seedNumber,i*7+3)*7;p.spin[1]=noise(seedNumber,i*7+4)*7;p.spin[2]=noise(seedNumber,i*7+5)*7;
    p.scale=i===0?[1.25,.78,.26]:i===1?[.72,.66,.22]:i<6?[1,1,1]:[.55,.42,.18];
    p.color=i<2?body:i<6?wheel:body;p.wheel=i>=2&&i<6;p.born=now;p.expires=now+LIFE_MS+(i<2?1000:0);p.active=true;
  }
  const burst=chooseBurst();burst.born=now;burst.expires=now+BLAST_MS;burst.active=true;burst.pos=[ox,oy,oz];
  setData("worldCarExplosionSpawns",(Number(view()?.dataset.worldCarExplosionSpawns)||0)+1);
  setData("worldCarExplosionLastId",String(id||""));setData("worldCarExplosionStyle","round-layered-v2");
  return true;
}
export function tickNativeCarDebris(game,now=performance.now()){
  if(game)host=game;
  const dt=lastNow?Math.min(.08,Math.max(0,(now-lastNow)/1000)):FIXED_STEP;lastNow=now;
  accumulator+=dt;let steps=0;
  while(accumulator>=FIXED_STEP&&steps<MAX_STEPS){step(FIXED_STEP);accumulator-=FIXED_STEP;steps++;}
  if(steps===MAX_STEPS)accumulator=Math.min(accumulator,FIXED_STEP);
  const bins={box:[[],[]],boxFade:[[],[]],wheel:[[],[]],wheelFade:[[],[]],burst:[[],[]],ring:[[],[]]};
  let activeParts=0,activeBursts=0;
  for(const p of pieces){
    if(!p.active)continue;
    if(now>=p.expires){p.active=false;continue;}
    activeParts++;
    const remaining=p.expires-now,alpha=remaining<FADE_MS?Math.max(0,remaining/FADE_MS):1;
    const key=(p.wheel?"wheel":"box")+(alpha<1?"Fade":"");
    bins[key][0].push(...fromTRS(p.pos,p.q,p.scale));bins[key][1].push(p.color[0],p.color[1],p.color[2],alpha);
  }
  for(const b of bursts){
    if(!b.active)continue;
    if(now>=b.expires){b.active=false;continue;}
    activeBursts++;
    for(const part of burstPose(b,now)){
      const key=part.ring?"ring":"burst",s=part.scale;
      bins[key][0].push(...fromTRS(part.pos,part.q||[0,0,0,1],[s,s,s]));
      bins[key][1].push(part.rgb[0],part.rgb[1],part.rgb[2],part.alpha);
    }
  }
  setData("worldCarDebrisActive",activeParts);setData("worldCarExplosions",activeBursts);
  const renderer=host?.world?.renderer;if(!renderer?.upsert)return{activeParts,activeBursts};
  const geos={box:BOX,boxFade:BOX,wheel:WHEEL,wheelFade:WHEEL,burst:BALL,ring:RING};
  const ids={box:"actors/car-debris",boxFade:"actors/car-debris-fade",wheel:"actors/car-wheels",wheelFade:"actors/car-wheels-fade",burst:"actors/car-burst",ring:"actors/car-ring"};
  for(const key of Object.keys(bins)){
    const [data,tints]=bins[key],id=ids[key];
    if(!data.length){if(drawn[key]){renderer.remove(id);drawn[key]=false;}continue;}
    const instances={transforms:new Float32Array(data),tints:new Float32Array(tints)},blend=key!=="box"&&key!=="wheel";
    if(drawn[key])renderer.updateInstances(id,instances);
    else{renderer.upsert(id,{...geos[key],instances,material:{doubleSided:true,castShadow:false,unlit:blend,alphaMode:blend?"blend":"opaque"}});drawn[key]=true;}
  }
  return{activeParts,activeBursts};
}
export function nativeCarDebrisStats(){
  return{activePieces:pieces.filter(p=>p.active).length,activeBursts:bursts.filter(b=>b.active).length,pool:pieces.length,maxExplosions:MAX,partsPerExplosion:PARTS,style:"round-layered-v2"};
}
