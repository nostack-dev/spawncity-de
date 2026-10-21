// Native street lamps. Poles, heads and sodium pools are WebGL2 instances.
// The old Three.js module is the spec; this file does not import it.
// Breakage, audio and multiplayer replication stay for a later pass.
import {fromTRS} from "./native_render_math.mjs";
export const NATIVE_STREET_LAMPS_VERSION="native-sodium-lamps-v1";
const SPACING=34,MAX=900,POLE_H=6.2;
const yawQuat=yaw=>[0,0,Math.sin(yaw/2),Math.cos(yaw/2)];
function addBox(batch,lo,hi,color){
 const [x,y,z]=lo,[X,Y,Z]=hi;
 const faces=[
  [[x,y,z],[x,Y,z],[x,Y,Z],[x,y,Z],[-1,0,0]],
  [[X,Y,z],[X,y,z],[X,y,Z],[X,Y,Z],[1,0,0]],
  [[X,y,z],[x,y,z],[x,y,Z],[X,y,Z],[0,-1,0]],
  [[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z],[0,1,0]],
  [[x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z],[0,0,1]],
  [[x,y,z],[X,y,z],[X,Y,z],[x,Y,z],[0,0,-1]]
 ];
 for(const [a,b,c,d,normal] of faces){
  for(const [v,uv] of [[a,[0,0]],[b,[1,0]],[c,[1,1]],[a,[0,0]],[c,[1,1]],[d,[0,1]]]){
   batch.p.push(...v);batch.n.push(...normal);batch.c.push(...color);batch.uv.push(...uv);
  }
 }
}
function meshOf(batch){
 return {positions:new Float32Array(batch.p),normals:new Float32Array(batch.n),colors:new Float32Array(batch.c),uvs:new Float32Array(batch.uv)};
}
function poleMesh(){
 const batch={p:[],n:[],c:[],uv:[]},steel=[.17,.18,.2];
 addBox(batch,[-.09,-.09,0],[.09,.09,POLE_H],steel);
 addBox(batch,[0,-.045,POLE_H-.16],[1.42,.045,POLE_H-.07],steel);
 return meshOf(batch);
}
function headMesh(){
 const batch={p:[],n:[],c:[],uv:[]};
 addBox(batch,[1.12,-.13,POLE_H-.26],[1.72,.13,POLE_H-.12],[1,.74,.42]);
 return meshOf(batch);
}
function lampGlow(){const night=Number(globalThis.__dayNight?.state?.night)||0;return Math.min(1,Math.max(0,(night-.15)/.5));}
function poolMesh(){
 const batch={p:[],n:[],c:[],uv:[]};
 addBox(batch,[-.5,-.5,.02],[.5,.5,.03],[1,.72,.38]);
 return meshOf(batch);
}
export function nativeLampPoints(roadLines,{max=MAX,spacing=SPACING}={}){
 if(!Array.isArray(roadLines))throw Error("native lamps need OSM road lines");
 if(!(max>=1)||!(spacing>=4))throw Error("invalid native lamp spacing");
 const points=[],seen=new Set();
 const list=roadLines.filter(road=>road&&!/path|track/.test(String(road.cls||""))&&Array.isArray(road.pts));
 for(const road of list){
  let carry=spacing*.5,side=1;
  const pts=road.pts,width=Number(road.w)||6;
  for(let i=0;i<pts.length-1&&points.length<max;i++){
   const a=pts[i],b=pts[i+1];
   if(!Array.isArray(a)||!Array.isArray(b))continue;
   const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(!(length>.5))continue;
   const ux=dx/length,uy=dy/length,nx=-uy,ny=ux;
   for(let t=carry;t<length&&points.length<max;t+=spacing){
    side=-side;
    const off=width/2+1.15,x=a[0]+ux*t+nx*off*side,y=a[1]+uy*t+ny*off*side;
    const key=Math.round(x/8)+","+Math.round(y/8);
    if(seen.has(key))continue;
    seen.add(key);
    const yaw=Math.atan2(-ny*side,-nx*side);
    points.push({x,y,yaw,hx:x+Math.cos(yaw)*1.42,hy:y+Math.sin(yaw)*1.42});
   }
   carry=((carry-length)%spacing+spacing)%spacing;
  }
 }
 return points;
}
export class NativeStreetLamps{
 constructor(renderer,{heightAt}={}){
  if(!renderer?.upsert||!renderer?.remove||typeof heightAt!=="function")
   throw Error("native street lamps need the WebGL2 renderer and ground height");
  this.renderer=renderer;this.heightAt=heightAt;this.points=[];this.built=false;
  this.pole=poleMesh();this.head=headMesh();this.pool=poolMesh();
 }
 setRoads(roadLines){
  const placed=nativeLampPoints(roadLines);
  this.points=placed.map(point=>{
   const z=Number(this.heightAt(point.x,point.y));
   if(!Number.isFinite(z))throw Error("native lamp has no ground height");
   return {...point,z};
  });
  this.upload();
  return this.points.length;
 }
 upload(){
  const n=this.points.length;
  const poleT=new Float32Array(Math.max(1,n)*16),headT=new Float32Array(Math.max(1,n)*16),poolT=new Float32Array(Math.max(1,n)*16);
  const tint=new Float32Array(Math.max(1,n)*4);
  for(let i=0;i<n;i++){
   const p=this.points[i],q=yawQuat(p.yaw);
   poleT.set(fromTRS([p.x,p.y,p.z],q,[1,1,1]),i*16);
   headT.set(fromTRS([p.x,p.y,p.z],q,[1,1,1]),i*16);
   poolT.set(fromTRS([p.hx,p.hy,p.z],q,[13,13,1]),i*16);
   tint.set([1,.78,.48,1],i*4);
  }
  const send=(id,geometry,transforms,material)=>{
   const data={...geometry,instances:{transforms:n?transforms.slice(0,n*16):new Float32Array(0),tints:n?tint.slice(0,n*4):new Float32Array(0)},material};
   if(!n){if(this.built)this.renderer.remove(id);return;}
   this.renderer.upsert(id,data);
  };
  send("lamps/poles",this.pole,poleT,{color:[1,1,1,1],castShadow:true});
  // Production street_lamps.mjs: heads glow and pools appear only at night
  // (glow = (night - .15) / .5 of the day / night cycle).
  const g=this.glow=lampGlow();
  send("lamps/heads",this.head,headT,g>.01?{color:[1,.78,.45,1],unlit:true,castShadow:false}:{color:[.86,.84,.8,1],castShadow:false});
  send("lamps/pools",this.pool,poolT,{color:[1,.72,.38,.45*g],unlit:true,alphaMode:"blend",castShadow:false,doubleSided:true});
  if(n)this.renderer.setVisible?.("lamps/pools",g>.01);
  this.built=n>0;
 }
 syncNight(){
  if(!this.points?.length)return;
  const g=lampGlow();
  if(Math.abs(g-(this.glow??-1))>=.01||(g===0)!==(this.glow===0))this.upload();
 }
 contribute(lights,eye){
  if(!lights?.request||!Array.isArray(eye))return 0;
  this.syncNight();
  if(!(this.glow>.01))return 0;
  const ranked=this.points.map(p=>({p,d:Math.hypot(p.hx-eye[0],p.hy-eye[1])})).sort((a,b)=>a.d-b.d).slice(0,6);
  for(const row of ranked)lights.request([row.p.hx,row.p.hy,row.p.z+POLE_H],{color:[1,.7,.36],intensity:16*this.glow,distance:22});
  return ranked.length;
 }
 clear(){
  for(const id of ["lamps/poles","lamps/heads","lamps/pools"])this.renderer.remove(id);
  this.points=[];this.built=false;
 }
}
