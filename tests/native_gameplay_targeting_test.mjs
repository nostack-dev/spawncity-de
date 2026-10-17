import assert from "node:assert/strict";
import {NativeRigidVisuals} from "../sim/native_rigid_visuals.mjs";
import {NativeWorldPresenter} from "../sim/native_world_presenter.mjs";
import {WorldRigidBodyPhysics} from "../sim/world_rigid_body_physics.mjs";

const poses=new Map([
 ["taxi-1",{position:[0,8,1],rotation:[0,0,0,1],wheels:[]}],
 ["taxi-2",{position:[0,12,1],rotation:[0,0,0,1],wheels:[]}]
]);
const bodies=[{id:"taxi-1",kind:"car",halfExtents:[2,.8,.6]},
 {id:"taxi-2",kind:"car",halfExtents:[2,.8,.6]}];
const gpu={upsert(){},updateInstances(){},remove(){}};
const visuals=new NativeRigidVisuals(gpu,{bodies:()=>bodies,renderPose:id=>poses.get(id)});
visuals.update();
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:0}),"taxi-1");
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:1}),"taxi-2");
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:3}),null);
gpu.updateInstances=()=>{throw Error("GPU buffer upload failed");};
bodies.reverse();
assert.throws(()=>visuals.update(),/GPU buffer upload failed/);
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:0}),"taxi-1",
 "failed GPU update must retain previous live body ID order");
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:1}),"taxi-2");
gpu.updateInstances=()=>{};
visuals.update();
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:0}),"taxi-2",
 "successful GPU reorder must atomically update hit-ID mapping");
bodies.reverse();
visuals.update();
assert.equal(visuals.bodyIdForHit({id:"osm/roads:0,0",instance:0}),null);

const physics=Object.create(WorldRigidBodyPhysics.prototype);
let received=null;
physics.world={};
physics.shapeRecords=new Map([["17:0:1",{id:"taxi-2",kind:"car"}]]);
physics.b3={
 b3DefaultQueryFilter:()=>({}),
 b3World_CastRayClosest:(world,origin,translation,filter)=>{
  received={world,origin,translation,filter};
  return {hit:true,fraction:.24,shapeId:{index1:17,world0:0,generation:1},
   point:[0,12,1],normal:[0,-1,0]};
 }
};
const ray={origin:[0,0,1],direction:[0,1,0]};
const presenter=Object.create(NativeWorldPresenter.prototype);
presenter.disposed=false;presenter.camera={eye:[0,0,1]};presenter.rigids=visuals;
presenter.worldPhysics=physics;
presenter.renderer={
 canvas:{clientWidth:960,clientHeight:540},width:1920,height:1080,far:100,
 getScreenRay:(x,y)=>{assert.equal(x,960);assert.equal(y,540);return ray;},
 pick:(x,y)=>{assert.equal(x,960);assert.equal(y,540);return {
  hit:{id:"box3d/car",instance:1,distance:11,point:[0,11,1]},trianglesExamined:36
 };}
};
const result=presenter.pickGameplay(480,270,{maxDistance:50});
assert.equal(result.hit.id,"taxi-2");
assert.equal(result.hit.source,"box3d","gameplay damage must come from actual C-WASM raycast");
assert.equal(result.hit.distance,12);
assert.equal(result.visualHit.bodyId,"taxi-2","GPU instance index must resolve the correct moving Box3D body");
assert.equal(received.translation[1],50);
assert.equal(received.filter.categoryBits,8n,"raycaster must use Box3D projectile query category");
assert.equal(received.filter.maskBits,7n,"raycaster must honor Box3D terrain/vehicle/drone collision mask");
assert.equal(result.trianglesExamined,36);
physics.b3.b3World_CastRayClosest=()=>({hit:false});
assert.equal(presenter.pickGameplay(480,270).hit,null,
 "decorative GPU geometry must never fabricate a Box3D collision");
assert.equal(presenter.pickGameplay(480,270).visualHit.bodyId,"taxi-2");
presenter.worldPhysics=null;
assert.throws(()=>presenter.pickGameplay(480,270),/authoritative Box3D/);
visuals.dispose();
assert.equal(visuals.bodyIdForHit({id:"box3d/car",instance:1}),null);
console.log("native WebGL2 gameplay ray matches authoritative Box3D hit and exact instanced body ID");
