// Exclusive native-WebGL2 visual adapter for the authoritative Box3D runtime.
// Body poses come from renderPose(), NEVER from a separately integrated visual
// simulation or Three.js. Draw calls are per body class, not per vehicle.
// This module does not render by itself: it populates NativeSceneRenderer.
import {fromTRS} from "./native_render_math.mjs";
import {ORIGINAL_SEDAN,ORIGINAL_BUS,ORIGINAL_WHEEL} from "./native_original_vehicles.mjs";
import {ORIGINAL_DRONE,ORIGINAL_JET,ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";
import {rotateByQuaternion} from "./native_airframe_presentation.mjs";
export const NATIVE_RIGID_VISUALS_VERSION="box3d-native-instanced-visuals-v3-original-car";
const CATEGORIES=["car","bus","drone","jet","prop","human"];
const RGB={car:[1,1,1,1],bus:[1,1,1,1],drone:[.25,.48,.63,1],jet:[1,1,1,1],prop:[.7,.69,.63,1],human:[1,1,1,1],wheel:[1,1,1,1]};
const NAME={car:"box3d/car",bus:"box3d/bus",drone:"box3d/drone",jet:"box3d/jet",prop:"box3d/prop",human:"box3d/human",wheel:"box3d/wheels"};
const nextId=s=>String(s||"").toLowerCase();
export function box3dVisualCategory(record){
 const kind=nextId(record?.kind),id=nextId(record?.id);
 if(/bus|coach/.test(kind)||/bus/.test(id))return "bus";
 if(/jet|aircraft|fighter|plane|vtol/.test(kind)||/jet|fighter/.test(id))return "jet";
 if(/human|person|pedestrian|zombie|walker|crowd/.test(kind)||/player-foot|person/.test(id))return "human";
 if(record?.drone||/drone|quad|uav/.test(kind)||/police.drone/.test(id))return "drone";
 if(/car|taxi|truck|vehicle|police|motor/.test(kind)||/vehicle|car|truck/.test(id))return "car";
 return "prop";
}
function cubeGeometry(kind){
 const p=[],n=[],c=[],uv=[];
 const base=RGB[kind],add=(a,b,d,e,color,normal)=>{
  const vertices=[a,b,d,a,d,e],uvs=[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]];
  vertices.forEach((v,i)=>{p.push(...v);n.push(...normal);c.push(color[0],color[1],color[2]);uv.push(...uvs[i]);});
 };
 const prism=(lo,hi,color)=>{
  const [x,y,z]=lo,[X,Y,Z]=hi;
  add([x,y,z],[x,Y,z],[x,Y,Z],[x,y,Z],color,[-1,0,0]);
  add([X,Y,z],[X,y,z],[X,y,Z],[X,Y,Z],color,[1,0,0]);
  add([X,y,z],[x,y,z],[x,y,Z],[X,y,Z],color,[0,-1,0]);
  add([x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z],color,[0,1,0]);
  add([x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z],color,[0,0,1]);
  add([x,y,z],[X,y,z],[X,Y,z],[x,Y,z],color,[0,0,-1]);
 };
 prism([-.5,-.5,-.5],[.5,.5,.5],base);
 if(kind==="car"){
  const paint=[1,1,1],glass=[.35,.55,.62],trim=[.22,.24,.27],lamp=[1.7,1.6,1.15],tail=[1.5,.12,.1];
  prism([-.5,-.46,-.42],[.5,.46,.42],paint);
  prism([-.22,-.38,.38],[.24,.38,1.15],glass);
  prism([-.16,-.34,1.12],[.1,.34,1.28],paint);
  prism([.42,-.4,-.05],[.5,.4,.22],lamp);
  prism([-.5,-.34,.02],[-.44,.34,.28],tail);
  prism([.46,-.48,-.2],[.5,.48,.05],trim);
  prism([-.5,-.48,-.2],[-.46,.48,.05],trim);
 }else if(kind==="bus"){
  const paint=[1,1,1],glass=[.28,.48,.58],trim=[.16,.17,.19];
  prism([-.5,-.48,-.48],[.5,.48,.55],paint);
  prism([-.42,-.46,.48],[.38,.46,1.15],paint);
  prism([.28,-.44,.5],[.48,.44,1.02],glass);
  prism([-.36,-.44,.62],[.22,.44,.98],glass);
  prism([.46,-.36,-.1],[.5,.36,.18], [1.6,1.55,1.1]);
  prism([-.5,-.3,.05],[-.46,.3,.28],[1.4,.1,.08]);
  prism([-.5,-.5,-.35],[.5,.5,-.22],trim);
 }else if(kind==="drone"){
  const carbon=[.55,.6,.66],accent=[.7,1.4,1.6],dark=[.2,.22,.26],nose=[1.6,.35,.4];
  prism([-.22,-.16,-.28],[.22,.16,.18],carbon);
  prism([-.16,-.12,.16],[.2,.12,.42],accent);
  prism([-.5,-.06,-.12],[.5,.06,.02],carbon);
  prism([-.06,-.5,-.12],[.06,.5,.02],carbon);
  for(const s of[-1,1])for(const t of[-1,1])prism([s*.32-.12,t*.32-.12,.02],[s*.32+.12,t*.32+.12,.28],dark);
  prism([-.48,-.08,-.08],[-.28,.08,.2],nose);
 }else if(kind==="human"){
  const shirt=[.29,.32,.22],pants=[.24,.23,.2],skin=[.75,.54,.4],boot=[.1,.1,.09];
  prism([-.22,-.16,-.08],[.22,.16,.42],shirt);
  prism([-.16,-.14,.4],[.16,.14,.72],skin);
  prism([-.18,-.16,.55],[.18,.16,.78],[.22,.25,.16]);
  prism([-.42,-.1,-.02],[-.22,.1,.4],shirt);
  prism([.22,-.1,-.02],[.42,.1,.4],shirt);
  prism([-.2,-.12,-.5],[-.04,.12,-.06],pants);
  prism([.04,-.12,-.5],[.2,.12,-.06],pants);
  prism([-.2,-.16,-.5],[-.02,.16,-.4],boot);
  prism([.02,-.16,-.5],[.2,.16,-.4],boot);
 }else if(kind==="wheel"){
  prism([-.5,-.5,-.5],[.5,.5,.5],[.12,.13,.15]);
  prism([-.28,-.55,-.28],[.28,.55,.28],[.72,.74,.78]);
 }else if(kind==="prop"){
  prism([-.5,-.5,-.5],[.5,.5,.5],base);
 }
 return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),uvs:new Float32Array(uv)};
}
const GEOMETRIES={car:ORIGINAL_SEDAN,bus:ORIGINAL_BUS,drone:ORIGINAL_DRONE,jet:ORIGINAL_JET,human:ORIGINAL_HUMAN,prop:cubeGeometry("prop")};
const WHEEL=ORIGINAL_WHEEL;
const REAL_SIZE=new Set(["car","bus","jet","drone","human"]);
const finite3=values=>Array.isArray(values)&&values.length===3&&values.every(Number.isFinite);
const finite4=values=>Array.isArray(values)&&values.length===4&&values.every(Number.isFinite);
const saneExtents=h=>finite3(h)&&h.every(v=>v>.01&&v<300);
function validPose(pose){
 return pose&&finite3(pose.position)&&finite4(pose.rotation);
}
export class NativeRigidVisuals{
 constructor(renderer,physics,{maxBodies=1500,hiddenBodyIds=[]}={}){
  if(!renderer?.upsert||!renderer?.updateInstances||!renderer?.remove||!physics?.bodies||!physics?.renderPose)
   throw Error("native rigid visuals require native renderer and authoritative Box3D bodies/poses");
  this.renderer=renderer;this.physics=physics;this.maxBodies=maxBodies;
  this.hiddenBodyIds=new Set(Array.from(hiddenBodyIds,String));this.active=new Set();this.instanceIds=new Map();this.disposed=false;
  this.frame=0;this.snapshot={bodies:0,wheels:0,groups:0,skipped:0,triangles:0};
 }
 update(){
  if(this.disposed)throw Error("native rigid visuals disposed");
  const bodies=this.physics.bodies();
  if(!Array.isArray(bodies))throw Error("invalid Box3D bodies list");
  const grouped=new Map(CATEGORIES.map(k=>[k,{transforms:[],tints:[],ids:[]}]));
  const wheels={transforms:[],tints:[],ids:[]};let count=0,skipped=0;
  for(const body of bodies.slice(0,this.maxBodies)){
   // A first-person avatar is a real, authoritative Box3D collider, but
   // rendering its torso *inside the local camera* hides the entire city.
   // Skip only its visual mesh; never skip or replace its physics body.
   if(this.hiddenBodyIds.has(String(body.id))){skipped++;continue;}
   if(!saneExtents(body.halfExtents)){skipped++;continue;}
   const pose=this.physics.renderPose(body.id);
   if(!validPose(pose)){skipped++;continue;}
   const kind=box3dVisualCategory(body);
   const group=grouped.get(kind);
   const half=body.halfExtents;
   let position=pose.position;
   // The soldier mesh stands on z=0. The collider origin is its centre.
   if(kind==="human"){
    const down=rotateByQuaternion([0,0,-half[2]],pose.rotation);
    position=[pose.position[0]+down[0],pose.position[1]+down[1],pose.position[2]+down[2]];
   }
   const visualScale=REAL_SIZE.has(kind)?[1,1,1]:half.map(v=>2*v);
   group.transforms.push(...fromTRS(position,pose.rotation,visualScale));
   const color=RGB[kind];group.tints.push(...color);group.ids.push(String(body.id));
   count++;
   if(Array.isArray(pose.wheels))for(const wheel of pose.wheels){
    if(!validPose(wheel))continue;
    // Radius can be read from the current pose when provided; never move a
    // wheel independently of Box3D's authoritative joint/axle transforms.
    const r=Math.max(.1,Math.min(1,Number(wheel.radius)||.34));
    const s=r/.34;
    wheels.transforms.push(...fromTRS(wheel.position,wheel.rotation,[s,s,s]));
    wheels.tints.push(...RGB.wheel);wheels.ids.push(String(body.id));
   }
  }
  let groups=0,triangles=0;
  const send=(kind,batch,geometry)=>{
   const name=NAME[kind],count=batch.transforms.length/16;
   if(!count){
    if(this.active.has(name)){this.renderer.remove(name);this.active.delete(name);}
    this.instanceIds.delete(name);
    return;
   }
   const instances={transforms:new Float32Array(batch.transforms),tints:new Float32Array(batch.tints)};
   if(this.active.has(name))this.renderer.updateInstances(name,instances);
   else{this.renderer.upsert(name,{...geometry,instances,material:{doubleSided:kind==="jet"||kind==="drone"||kind==="human",alphaMode:"opaque"}});this.active.add(name);}
   // Only commit a new collision-target index AFTER the GPU accepted that
   // exact instance order. A failed upload must not make shots hit another car.
   this.instanceIds.set(name,batch.ids);
   groups++;triangles+=geometry.positions.length/9*count;
  };
  for(const kind of CATEGORIES)send(kind,grouped.get(kind),GEOMETRIES[kind]);
  send("wheel",wheels,WHEEL);
  this.frame++;
  this.snapshot={bodies:count,wheels:wheels.transforms.length/16,groups,skipped,triangles,frame:this.frame};
  return this.snapshot;
 }
 bodyIdForHit(hit){
  const ids=this.instanceIds.get(hit?.id),index=hit?.instance;
  return Number.isInteger(index)&&index>=0?ids?.[index]??null:null;
 }
 dispose(){
  if(this.disposed)return;
  for(const id of this.active)this.renderer.remove(id);
  this.active.clear();this.instanceIds.clear();this.disposed=true;
 }
}
