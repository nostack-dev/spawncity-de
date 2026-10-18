import assert from "node:assert/strict";
import {unobstructedNativeChaseEye} from "../sim/native_camera_occlusion.mjs";
import {buildingLaunchPointClear} from "../sim/world_building_collision_physics.mjs";
import {nativeGameplayCamera} from "../sim/native_gameplay_camera.mjs";
const building=(x,y,w,h,top=18)=>({buildingKey:"real-osm-wall",base:0,top,
 points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]});
const snapshot={hash:"osm",footprintCount:1,prismCount:1,prisms:[building(4.5,-7,2,4)]};
const target=[11.05,-5,2.2],desired=[6.05,-5,4.4];
const clear=unobstructedNativeChaseEye(desired,target,snapshot);
assert.notDeepEqual(clear,desired,"old car eye must be moved out of OSM building wall");
assert.equal(buildingLaunchPointClear(snapshot,clear.slice(0,2),{clearanceM:.35}),true);
assert.ok(clear[0]>desired[0]&&clear[0]<target[0],"preserve proper third-person follow, not a new first-person camera");
assert.equal(unobstructedNativeChaseEye(desired,target,null)[0],desired[0]);
const closeWall={hash:"close",footprintCount:1,prismCount:1,prisms:[building(9,-7,1,4)]};
const elevated=unobstructedNativeChaseEye(desired,target,closeWall);
assert.ok(elevated[2]>target[2]+3,"very near wall forces unobstructed overhead look");
assert.equal(buildingLaunchPointClear(closeWall,elevated.slice(0,2),{clearanceM:.35}),true);
const rooftop={hash:"roof",footprintCount:1,prismCount:1,prisms:[building(4.5,-7,2,4,2)]};
assert.deepEqual(unobstructedNativeChaseEye(desired,target,rooftop),desired,
 "building below the physical camera cannot occlude view");
assert.throws(()=>unobstructedNativeChaseEye([NaN,0,0],target,snapshot),/finite Box3D/);
assert.throws(()=>unobstructedNativeChaseEye(desired,target,snapshot,{samples:1}),/ray steps/);
const state={mode:"car",car:{active:true,pose:{position:[10,-5,1],rotation:[0,0,0,1],yaw:0},speedMps:0},
 carObstacleSnapshot:snapshot};
const camera=nativeGameplayCamera(state,{aspect:16/9,now:123}).camera;
assert.deepEqual(camera.target,target);
assert.deepEqual(camera.eye,clear);
assert.ok(camera.near>.1);
const unchanged=nativeGameplayCamera({...state,carObstacleSnapshot:null},{aspect:16/9,now:123}).camera;
assert.deepEqual(unchanged.eye,desired,"maps that have no buildings preserve original camera exactly");
console.log("native car third-person camera clips to REAL OSM collision prisms, not through walls; roof height respected");
