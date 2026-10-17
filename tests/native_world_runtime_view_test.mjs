import assert from "node:assert/strict";
import {nativeRigidRuntimeView} from "../sim/native_world_physics_view.mjs";
import {WorldRigidBodyPhysics} from "../sim/world_rigid_body_physics.mjs";
import {NativeRigidVisuals} from "../sim/native_rigid_visuals.mjs";

const b3Body={p:[6,0,2],q:[0,0,0,1]};
const engine=Object.create(WorldRigidBodyPhysics.prototype);
engine.records=new Map([["car",{id:"car",kind:"car",body:b3Body,halfExtents:[2,.9,.65],
 prevP:[2,0,2],prevQ:[0,0,0,1],prevValid:true}]]);
engine.b3={
 b3Body_IsValid:b=>b===b3Body,
 b3Body_GetPosition:(out,b)=>{out.splice(0,3,...b.p);return out;},
 b3Body_GetRotation:(out,b)=>{out.splice(0,4,...b.q);return out;},
 b3Body_GetLinearVelocity:out=>{out.splice(0,3,2,0,0);return out;},
 b3Body_GetAngularVelocity:out=>{out.splice(0,3,0,0,0);return out;}
};
let ready=null,alpha=.25,usedRenderPose=0;
const runtime={
 get engine(){return ready;},
 renderPose(id){usedRenderPose++;return ready?.renderPose(id,alpha)??null;},
 raycast:()=>null
};
const view=nativeRigidRuntimeView(runtime);
assert.deepEqual(view.bodies(),[],"no second physics world while real WASM runtime is booting");
ready=engine;
assert.deepEqual(view.bodies(),[{id:"car",kind:"car",halfExtents:[2,.9,.65],drone:undefined}]);
const p=view.renderPose("car");
assert.equal(p.position[0],3,"runtime's authoritative 60 Hz interpolation alpha must be respected");
alpha=.75;
assert.equal(view.renderPose("car").position[0],5);
assert.equal(usedRenderPose,2,"the production renderPose API must be used");
const meshes=new Map();
const gpu={
 upsert(id,mesh){meshes.set(id,mesh);},
 updateInstances(id,instances){meshes.get(id).instances=instances;},
 remove(id){meshes.delete(id);}
};
const visuals=new NativeRigidVisuals(gpu,view);
assert.equal(visuals.update().bodies,1);
assert.equal(meshes.get("box3d/car").instances.transforms[12],5);
b3Body.p[0]=10;
alpha=1;
visuals.update();
assert.equal(meshes.get("box3d/car").instances.transforms[12],10);
ready=null;
assert.equal(visuals.update().bodies,0,"offline runtime must evict stale rendered cars");
assert.equal(meshes.size,0);
visuals.dispose();
assert.throws(()=>nativeRigidRuntimeView({}),/runtime/);
console.log("native WebGL2 consumes live world_rigid_body_runtime's interpolated Box3D bodies");
