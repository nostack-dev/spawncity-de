// Exclusive native-WebGL2 visual adapter for the authoritative Box3D runtime.
// Body poses come from renderPose(), NEVER from a separately integrated visual
// simulation or Three.js. Draw calls are per body class, not per vehicle.
// This module does not render by itself: it populates NativeSceneRenderer.
import {fromTRS} from "./native_render_math.mjs";
export const NATIVE_RIGID_VISUALS_VERSION="box3d-native-instanced-visuals-v1";
const CATEGORIES=["car","bus","drone","jet","prop"];
const RGB={car:[.64,.77,.9,1],bus:[.95,.73,.36,1],drone:[.25,.48,.63,1],jet:[.72,.78,.82,1],prop:[.7,.69,.63,1],wheel:[.09,.11,.14,1]};
const NAME={car:"box3d/car",bus:"box3d/bus",drone:"box3d/drone",jet:"box3d/jet",prop:"box3d/prop",wheel:"box3d/wheels"};
const nextId=s=>String(s||"").toLowerCase();
export function box3dVisualCategory(record){
 const kind=nextId(record?.kind),id=nextId(record?.id);
 if(/bus|coach/.test(kind)||/bus/.test(id))return "bus";
 if(/jet|aircraft|fighter|plane|vtol/.test(kind)||/jet|fighter/.test(id))return "jet";
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
 if(kind==="car"||kind==="bus"){
  const glass=[.55,.74,.8,1],lamp=[.95,.97,.9,1],tail=[.72,.12,.08,1];
  prism([-.28,-.32,.5],[.16,.32,kind==="bus"?.78:.66],glass);
  prism([.46,-.42,-.08],[.5,.42,.08],lamp);
  prism([-.5,-.36,.02],[-.46,.36,.16],tail);
 }else if(kind==="drone"){
  const accent=[.12,.14,.16,1],rotor=[.2,.22,.24,1];
  prism([-.9,-.08,-.22],[.9,.08,-.02],accent);
  prism([-.08,-.9,-.22],[.08,.9,-.02],accent);
  prism([-.9,-.22,-.08],[-.62,.22,.02],rotor);
  prism([.62,-.22,-.08],[.9,.22,.02],rotor);
  prism([-.22,-.9,-.08],[.22,-.62,.02],rotor);
  prism([-.22,.62,-.08],[.22,.9,.02],rotor);
 }else if(kind==="jet"){
  const metal=[.78,.82,.86,1],canopy=[.45,.62,.7,1];
  prism([-.15,-.92,-.2],[.15,.72,.16],metal);
  prism([-.72,-.18,-.08],[.72,.22,.02],metal);
  prism([-.04,.55,.05],[.04,.92,.38],metal);
  prism([-.12,.18,.16],[.12,.48,.42],canopy);
 }
 return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),uvs:new Float32Array(uv)};
}
const GEOMETRIES=Object.fromEntries(CATEGORIES.map(kind=>[kind,cubeGeometry(kind)]));
const WHEEL=cubeGeometry("prop");
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
   // Box3D stores half-extents, whereas native unit geometry is ±0.5.
   group.transforms.push(...fromTRS(pose.position,pose.rotation,half.map(v=>2*v)));
   const color=RGB[kind];group.tints.push(...color);group.ids.push(String(body.id));
   count++;
   if(Array.isArray(pose.wheels))for(const wheel of pose.wheels){
    if(!validPose(wheel))continue;
    // Radius can be read from the current pose when provided; never move a
    // wheel independently of Box3D's authoritative joint/axle transforms.
    const r=Math.max(.1,Math.min(1,Number(wheel.radius)||.32));
    wheels.transforms.push(...fromTRS(wheel.position,wheel.rotation,[r*2,r*.55,r*2]));
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
   else{this.renderer.upsert(name,{...geometry,instances,material:{doubleSided:true}});this.active.add(name);}
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
