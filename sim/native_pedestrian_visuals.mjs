// Three-free native pedestrian presentation from the *existing* persistent
// agent pose contract {id,x,y,z,yaw}. This adapter never creates/updates agents:
// their authoritative routes, collisions, damage and AI stay in game logic.
import {fromTRS} from "./native_render_math.mjs";
import {ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";
export const NATIVE_PEDESTRIANS_VERSION="native-persistent-people-v1";
// The live articulated soldier, one instanced draw. Feet are at the agent's z.
const GEOMETRY=ORIGINAL_HUMAN,MESH_ID="actors/pedestrians";
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
   const yaw=Number(p.yaw),q=[0,0,Math.sin(yaw*.5),Math.cos(yaw*.5)];
   transform.push(...fromTRS([Number(p.x),Number(p.y),Number(p.z)],q,[1,1,1]));
   tints.push(1,1,1,1);
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
