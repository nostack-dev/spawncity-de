import assert from "node:assert/strict";
import {WorldRigidBodyPhysics} from "../sim/world_rigid_body_physics.mjs";
import {nativeWorldPhysicsView} from "../sim/native_world_physics_view.mjs";
import {NativeRigidVisuals} from "../sim/native_rigid_visuals.mjs";

// Reuse the REAL production Box3D physics class methods. Only the C-WASM
// read functions are stubbed to make the adapter test deterministic.
const world=Object.create(WorldRigidBodyPhysics.prototype);
const body={id:7,p:[10,0,3],q:[0,0,0,1],v:[4,0,0]};
world.b3={
 b3Body_IsValid:b=>b!==null&&b.id===7,
 b3Body_GetPosition:(out,b)=>{out.splice(0,3,...b.p);return out;},
 b3Body_GetRotation:(out,b)=>{out.splice(0,4,...b.q);return out;},
 b3Body_GetLinearVelocity:(out,b)=>{out.splice(0,3,...b.v);return out;},
 b3Body_GetAngularVelocity:(out,b)=>{out.splice(0,3,0,0,0);return out;}
};
world.records=new Map([["car-7",{
 id:"car-7",kind:"car",body,halfExtents:[2,.8,.6],drone:false,
 prevP:[6,0,3],prevQ:[0,0,0,1],prevValid:true
}]]);
let alpha=.5;
const view=nativeWorldPhysicsView(world,{alpha:()=>alpha});
assert.deepEqual(view.bodies(),[{id:"car-7",kind:"car",halfExtents:[2,.8,.6],drone:false}]);
const interpolated=view.renderPose("car-7");
assert.deepEqual(interpolated.position,[8,0,3],"must consume REAL Box3D temporal interpolation");
assert.deepEqual(interpolated.rotation,[0,0,0,1]);
assert.deepEqual(interpolated.velocity,[4,0,0]);
alpha=1;
assert.deepEqual(view.renderPose("car-7").position,[10,0,3]);
const calls=[];
const meshes=new Map();
const gpu={
 upsert(id,obj){calls.push(["upsert",id]);meshes.set(id,obj);},
 updateInstances(id,instances){calls.push(["update",id]);assert.ok(meshes.has(id));meshes.get(id).instances=instances;},
 remove(id){calls.push(["remove",id]);meshes.delete(id);}
};
const visuals=new NativeRigidVisuals(gpu,view);
assert.equal(visuals.update().bodies,1);
assert.equal(meshes.get("box3d/car").instances.transforms[12],10);
alpha=.5;
assert.equal(visuals.update().bodies,1);
assert.equal(meshes.get("box3d/car").instances.transforms[12],8);
assert.equal(calls.filter(c=>c[0]==="upsert").length,1,"do not rebuild GPU geometry per Box3D tick");
body.p=[12,0,3];
assert.equal(visuals.update().bodies,1);
assert.equal(meshes.get("box3d/car").instances.transforms[12],9);
world.records.delete("car-7");
assert.equal(visuals.update().bodies,0);
assert.equal(meshes.size,0);
world.records.set("invalid",{id:"invalid",kind:"jet",body:null,halfExtents:[2,2,2]});
assert.deepEqual(view.bodies(),[],"invalid Box3D handles must never reach WebGL2");
visuals.dispose();
assert.throws(()=>nativeWorldPhysicsView({records:new Map()}),/WorldRigidBodyPhysics/);
assert.throws(()=>nativeWorldPhysicsView(world,{alpha:()=>NaN}).renderPose("x"),/interpolation/);
console.log("native renderer uses real WorldRigidBodyPhysics records/interpolation, stable buffers and removal");
