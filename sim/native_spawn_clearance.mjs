// Keep local Box3D actors OUTSIDE genuine OSM building footprints on the
// first real-city load. Never disable a collider, invent a road, or change
// the native render camera to hide the underlying collision error.
import {buildingLaunchPointClear,findClearBuildingLaunchPoint} from "./world_building_collision_physics.mjs";
export const NATIVE_SPAWN_CLEARANCE_VERSION="box3d-real-osm-spawn-clearance-v1";
const actors=Object.freeze([
 {id:"player-foot",clearanceM:.95,minGroundOffsetM:.97},
 {id:"player-car",clearanceM:2.6,minGroundOffsetM:1.05},
 {id:"player-jet",clearanceM:12,minGroundOffsetM:2.5}
]);
export function clearNativeActorSpawns(rigids,snapshot,{heightAt=()=>0,firstLoad=true}={}){
 if(!rigids?.pose||!rigids?.setPose||!Array.isArray(snapshot?.prisms)||typeof heightAt!=="function")
  throw Error("native spawn clearance needs real Box3D bodies, terrain and building snapshot");
 if(!firstLoad)return {examined:0,moved:[],alreadyClear:true};
 const moved=[];let examined=0;
 for(const actor of actors){
  const pose=rigids.pose(actor.id);
  if(!pose?.position?.every(Number.isFinite))continue;
  examined++;
  const point=pose.position.slice(0,2);
  const originalHeight=Number(heightAt(...point));
  // Airborne jets must NOT teleport merely because their ground projection
  // happens to cross a building roof. Move only initial ground-level actors.
  if(actor.id==="player-jet"&&pose.position[2]>originalHeight+25)continue;
  if(buildingLaunchPointClear(snapshot,point,{clearanceM:actor.clearanceM}))continue;
  const clear=findClearBuildingLaunchPoint(snapshot,{point,clearanceM:actor.clearanceM,maxSearchM:180});
  if(!buildingLaunchPointClear(snapshot,clear,{clearanceM:actor.clearanceM}))
   throw Error("OSM native player relocation did not find collision-free clearance");
  const ground=Number(heightAt(...clear));
  if(!Number.isFinite(ground))throw Error("real terrain height invalid at safe OSM spawn");
  const next=[clear[0],clear[1],Math.max(ground+actor.minGroundOffsetM,pose.position[2])];
  if(!rigids.setPose(actor.id,{position:next,rotation:pose.rotation}))
   throw Error("Box3D refused safe OSM relocation of "+actor.id);
  moved.push({id:actor.id,from:pose.position.slice(0,3),to:next});
 }
 return {examined,moved,alreadyClear:moved.length===0};
}
