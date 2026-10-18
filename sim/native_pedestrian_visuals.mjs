// Three-free native pedestrian presentation from the *existing* persistent
// agent pose contract {id,x,y,z,yaw}. This adapter never creates/updates agents:
// their authoritative routes, collisions, damage and AI stay in game logic.
import {fromTRS} from "./native_render_math.mjs";
export const NATIVE_PEDESTRIANS_VERSION="native-persistent-people-v1";
const hash=s=>{let x=2166136261;for(const c of String(s))x=Math.imul(x^c.charCodeAt(0),16777619)>>>0;return x;};
const SKIN=[[.8,.57,.4],[.56,.34,.22],[.96,.75,.6],[.38,.25,.18]];
const OUTFIT=[[.33,.49,.63],[.71,.31,.36],[.3,.53,.37],[.54,.4,.67],[.67,.61,.39]];
// Unit character 1.74m tall; no Three.BufferGeometry. One entire humanoid
// mesh per person in a single instanced WebGL draw, not one draw per body part.
function makeHumanoid(){
 const p=[],n=[],c=[],uv=[];
 const face=(a,b,d,e,color,normal)=>{
  const verts=[a,b,d,a,d,e];
  const uvFace=[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]];
  for(let i=0;i<6;i++){p.push(...verts[i]);n.push(...normal);c.push(...color);uv.push(...uvFace[i]);}
 };
 const box=(lo,hi,color)=>{
  const [x,y,z]=lo,[X,Y,Z]=hi;
  face([x,y,z],[x,Y,z],[x,Y,Z],[x,y,Z],color,[-1,0,0]);
  face([X,Y,z],[X,y,z],[X,y,Z],[X,Y,Z],color,[1,0,0]);
  face([X,y,z],[x,y,z],[x,y,Z],[X,y,Z],color,[0,-1,0]);
  face([x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z],color,[0,1,0]);
  face([x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z],color,[0,0,1]);
  face([x,y,z],[X,y,z],[X,Y,z],[x,Y,z],color,[0,0,-1]);
 };
 const shirt=[.72,.83,.94],pants=[.25,.29,.34],skin=[.91,.72,.59],shoes=[.13,.15,.17];
 box([-.19,-.105,.76],[.19,.105,1.42],shirt);
 box([-.16,-.1,1.41],[.16,.1,1.73],skin);
 box([-.32,-.095,.79],[-.20,.095,1.38],skin);
 box([.20,-.095,.79],[.32,.095,1.38],skin);
 box([-.17,-.09,.13],[-.03,.09,.77],pants);
 box([.03,-.09,.13],[.17,.09,.77],pants);
 box([-.17,-.17,0],[-.03,.15,.16],shoes);
 box([.03,-.17,0],[.17,.15,.16],shoes);
 return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),uvs:new Float32Array(uv)};
}
const GEOMETRY=makeHumanoid(),MESH_ID="actors/pedestrians";
const finite=v=>Number.isFinite(Number(v));
export class NativePedestrianVisuals{
 constructor(renderer,population,{maxPeople=300}={}){
  if(!renderer?.upsert||!renderer?.updateInstances||!renderer?.remove||typeof population?.people!=="function")
   throw Error("native pedestrians require renderer and authoritative population people()");
  this.renderer=renderer;this.population=population;
  this.maxPeople=Math.max(0,Math.floor(maxPeople));this.active=false;this.disposed=false;
 }
 update(){
  if(this.disposed)throw Error("native people disposed");
  const agents=this.population.people(),transform=[],tints=[];
  if(!Array.isArray(agents))throw Error("invalid persistent agent state");
  let visible=0,skipped=0;
  for(const p of agents.slice(0,this.maxPeople)){
   if(!p||!finite(p.x)||!finite(p.y)||!finite(p.z)||!finite(p.yaw)){skipped++;continue;}
   const yaw=Number(p.yaw),seed=hash(p.id),q=[0,0,Math.sin(yaw*.5),Math.cos(yaw*.5)];
   transform.push(...fromTRS([Number(p.x),Number(p.y),Number(p.z)],q,[1,1,1]));
   const skin=SKIN[seed%SKIN.length],outfit=OUTFIT[(seed>>>5)%OUTFIT.length];
   tints.push(outfit[0]*.75+skin[0]*.25,outfit[1]*.75+skin[1]*.25,outfit[2]*.75+skin[2]*.25,1);
   visible++;
  }
  if(!visible){
   if(this.active){this.renderer.remove(MESH_ID);this.active=false;}
  }else{
   const instances={transforms:new Float32Array(transform),tints:new Float32Array(tints)};
   if(this.active)this.renderer.updateInstances(MESH_ID,instances);
   else{this.renderer.upsert(MESH_ID,{...GEOMETRY,instances,material:{doubleSided:true}});this.active=true;}
  }
  return {visible,skipped,drawCalls:visible?1:0,triangles:GEOMETRY.positions.length/9*visible};
 }
 dispose(){
  if(this.disposed)return;
  if(this.active)this.renderer.remove(MESH_ID);
  this.active=false;this.disposed=true;
 }
}
