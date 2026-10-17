// Authoritative WorldRigidBodyPhysics -> native graphics view.
// One-way, read-only and deliberately references the existing Box3D records:
// no second world, motion integrator, fake vehicle or Three.js objects.
export const NATIVE_WORLD_PHYSICS_VIEW_VERSION="box3d-records-native-view-v1";
const validRecord=r=>r&&typeof r.id==="string"&&Array.isArray(r.halfExtents)
 &&r.halfExtents.length===3&&r.halfExtents.every(n=>Number.isFinite(n)&&n>.01);
export function nativeWorldPhysicsView(world,{alpha=()=>1,maxBodies=2000}={}){
 if(!(world?.records instanceof Map)||typeof world.renderPose!=="function"
   ||typeof world.b3?.b3Body_IsValid!=="function")
  throw Error("native graphics requires existing WorldRigidBodyPhysics instance");
 if(typeof alpha!=="function"||!Number.isInteger(maxBodies)||maxBodies<1)
  throw Error("invalid native physics view options");
 return Object.freeze({
  bodies(){
   const out=[];
   for(const record of world.records.values()){
    if(!validRecord(record)||!world.b3.b3Body_IsValid(record.body))continue;
    out.push({id:record.id,kind:record.kind,halfExtents:record.halfExtents,drone:record.drone});
    if(out.length>=maxBodies)break;
   }
   return out;
  },
  renderPose(id){
   const t=Number(alpha());
   if(!Number.isFinite(t))throw Error("invalid Box3D frame interpolation");
   return world.renderPose(String(id),Math.max(0,Math.min(1,t)));
  }
 });
}
