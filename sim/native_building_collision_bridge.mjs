// One OSM building footprint set feeds BOTH real Box3D collision worlds and
// the single native WebGL2 mesh stream. No THREE.ShapeUtils/Three Vector2.
// Includes courtyards/concave outlines and honors the original 340m collision
// radius + bounded convex-hull budget (same game rules as the shipped stack).
import earcut from "./vendor/earcut.mjs";
import {makeBuildingCollisionSnapshot,WORLD_BUILDING_COLLISION_MAX_FOOTPRINTS,
  WORLD_BUILDING_COLLISION_RADIUS_M} from "./world_building_collisions.mjs";
import {nativeOsmProjector} from "./native_osm_projector.mjs";
export const NATIVE_BUILDING_COLLISIONS_VERSION="osm-mesh-box3d-one-snapshot-v1";

function polygonFaces(outer,holes){
 const rings=[outer,...holes],coords=[],indices=[];let count=0;
 for(const [i,ring] of rings.entries()){
  if(i)indices.push(count);
  for(const p of ring){coords.push(p[0],p[1]);count++;}
 }
 const tris=earcut(coords,indices,2);
 const triangles=[];
 for(let i=0;i+2<tris.length;i+=3)triangles.push([tris[i],tris[i+1],tris[i+2]]);
 return triangles;
}
export function nativeBuildingCollisionSnapshot(features,{origin,center=[0,0],
 radiusM=WORLD_BUILDING_COLLISION_RADIUS_M,
 maxFootprints=WORLD_BUILDING_COLLISION_MAX_FOOTPRINTS}={}){
 if(!Array.isArray(features)||!Array.isArray(center)||center.length!==2
  ||!center.every(Number.isFinite)||!Number.isFinite(radiusM)||radiusM<=0)
  throw Error("native building snapshot requires valid OSM features, center and radius");
 const {key,project}=nativeOsmProjector(origin);
 const snapshot=makeBuildingCollisionSnapshot(features,{
  project,center,radiusM,maxFootprints,triangulate:polygonFaces
 });
 return {...snapshot,originKey:key};
}
export function syncNativeBuildingCollisions({flight,rigids},snapshot){
 if(typeof flight?.setWorldBuildingCollisions!=="function"||typeof rigids?.syncBuildings!=="function"
  ||!snapshot||!Array.isArray(snapshot.prisms))
  throw Error("native OSM must update BOTH authoritative Box3D worlds");
 const previousFlight=flight.worldBuildingCollisionSnapshot;
 const previousRigid=rigids.buildingSnapshot;
 // Both mutators run synchronously between physics ticks. If either fails,
 // explicitly restore each previous known-good collision world.
 try{
  const flightChanged=flight.setWorldBuildingCollisions(snapshot);
  const rigidChanged=rigids.syncBuildings(snapshot);
  return {flightChanged,rigidChanged,prismCount:snapshot.prismCount};
 }catch(error){
  let rollbackError=null;
  try{if(previousFlight)flight.setWorldBuildingCollisions(previousFlight);}catch(e){rollbackError=e;}
  try{if(previousRigid)rigids.syncBuildings(previousRigid);}catch(e){rollbackError??=e;}
  if(rollbackError)throw new Error("Box3D building sync rollback failed; stop physics",{cause:rollbackError});
  throw error;
 }
}
