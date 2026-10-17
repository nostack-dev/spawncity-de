// State-only view of the ACTUAL persistent world population.
// No Three groups/scene graph, no spawning, no AI rewrites or separate NPCs.
// Matches the existing mobile/desktop crowd-visibility budgets and emits
// physical positions that NativePedestrianVisuals can instance directly.
export const NATIVE_POPULATION_VIEW_VERSION="persistent-people-state-only-v1";
export function nativePopulationSnapshot(agents,{center=[0,0],maxPeople=100,radius=170,heightAt=()=>0}={}){
 if(!Array.isArray(agents)||center?.length!==2||!center.every(Number.isFinite)
   ||!Number.isInteger(maxPeople)||maxPeople<0||!(radius>0)||typeof heightAt!=="function")
  throw Error("native crowd needs persistent agent records, Box3D center and ground height");
 const near=[],radiusSquared=radius*radius;
 for(const a of agents){
  if(!a||a.alive!==true||a.knocked||a.removed
   ||!Number.isFinite(a.x)||!Number.isFinite(a.y)||!Number.isFinite(a.yaw))continue;
  const dx=a.x-center[0],dy=a.y-center[1],dist2=dx*dx+dy*dy;
  if(dist2<=radiusSquared)near.push({a,dist2});
 }
 // Stable ID breaks equal-distance ties so gameplay does not shuffle person
 // instance/body IDs from one render frame to another.
 near.sort((u,v)=>u.dist2-v.dist2||String(u.a.id).localeCompare(String(v.a.id)));
 return near.slice(0,maxPeople).map(({a})=>{
  const z=Number.isFinite(a.z)?a.z:Number(heightAt(a.x,a.y));
  if(!Number.isFinite(z))throw Error("invalid authoritative Box3D pedestrian ground height");
  return {id:String(a.id),x:a.x,y:a.y,z,yaw:a.yaw,
   speed:Number.isFinite(a.v)?a.v:0,state:String(a.state||"wait")};
 });
}
