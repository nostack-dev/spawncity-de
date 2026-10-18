import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {WorldRigidBodyPhysics} from "../sim/world_rigid_body_physics.mjs";

// Prove with the real Erin Catto Box3D WASM: forward under FPS yaw=0 is
// world +Y; strafing moves +X; pre-existing vehicle-style target control is
// unchanged. No fake pose interpolation or camera translation.
const wasm=process.argv[2];
if(!wasm)throw Error("usage: node tests/native_foot_body_direction_test.mjs <box3d.inline.mjs>");
const b3=await (await import(pathToFileURL(resolve(wasm)).href)).default();
const physics=new WorldRigidBodyPhysics(b3);
for(const [id,y] of [["walker",0],["legacy",10]]){
 const id0=physics.addBody({id,kind:"human",wheeled:false,position:[1,y,.97],
  massKg:82,halfExtents:[.23,.23,.88],gravityScale:1});
 assert.ok(id0,"original Box3D body creation failed");
}
const begin=[...physics.pose("walker").position],dt=1/60;
for(let i=0;i<30;i++){
 const p=physics.pose("walker").position;
 physics.setTarget("walker",{position:[p[0],p[1]+4*dt,p[2]],
  speedMps:4,response:6,yaw:Math.PI/2,omnidirectional:true});
 const q=physics.pose("legacy").position;
 physics.setTarget("legacy",{position:[q[0]+3*dt,q[1],q[2]],
  speedMps:3,response:6,yaw:0});
 physics.step(dt,4,i*dt*1000);
}
const forward=[...physics.pose("walker").position],old=[...physics.pose("legacy").position];
assert.ok(forward[1]-begin[1]>.30,"native FPS +Y must really move forwards in Box3D");
assert.ok(Math.abs(forward[0]-begin[0])<.12,"forward must not drift sideways");
assert.ok(old[0]-begin[0]>.25,"legacy +X forward target must still work");
const beforeStrafe=[...forward];
for(let i=30;i<60;i++){
 const p=physics.pose("walker").position;
 physics.setTarget("walker",{position:[p[0]+4*dt,p[1],p[2]],
  speedMps:4,response:6,yaw:0,omnidirectional:true});
 physics.step(dt,4,i*dt*1000);
}
const afterStrafe=[...physics.pose("walker").position];
assert.ok(afterStrafe[0]-beforeStrafe[0]>.30,"native FPS +X strafe must change the SAME Box3D body");
assert.ok(afterStrafe.every(Number.isFinite));
physics.destroy();
console.log("Actual Box3D FPS movement: forward +Y, strafe +X; original non-omnidirectional steering unchanged");
