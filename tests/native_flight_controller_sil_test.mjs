import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createNativeFlightPhysics,nativeDefaultFlightParams} from "../sim/native_flight_physics.mjs";
import {NativeFlightController} from "../sim/native_flight_controller_wasm.mjs";
const [boxFile,flightFile]=process.argv.slice(2);
if(!boxFile||!flightFile)throw Error("usage: node tests/native_flight_controller_sil_test.mjs <box3d.inline.mjs> <flight_core_node.mjs>");
const b3=await (await import(pathToFileURL(resolve(boxFile)).href)).default();
const factory=(await import(pathToFileURL(resolve(flightFile)).href)).default;
const physics=createNativeFlightPhysics(b3,nativeDefaultFlightParams());
const input={roll:0,pitch:0,yaw:0,throttle:0,arm:false,gameMode:false};
const fc=new NativeFlightController(physics,{factory,controls:()=>input});
await fc.connect();
let output=null,steps=0,armedFrames=0;
const stateCounts=new Map();const snapshots=[];
function run(n){
 for(let i=0;i<n;i++){
  output=fc.tick();steps++;
  assert.equal(output.motors.length,4);
  assert.ok(output.motors.every(m=>Number.isInteger(m)&&m>=800&&m<=2200),
    "firmware output is genuine constrained ESC pulses");
  assert.ok(Number.isInteger(output.sequence)&&output.sequence===steps-1);
  if(output.state&1)armedFrames++;
  stateCounts.set(output.state,(stateCounts.get(output.state)||0)+1);
  if(steps%400===0)snapshots.push({step:steps,state:output.state,motors:[...output.motors],position:physics.position(),angular:physics.angular()});
  if(steps%200===0){
   const pose=physics.state();
   assert.ok([pose.x,pose.y,pose.z,pose.vx,pose.vy,pose.vz,
     ...physics.rotation(),...physics.motorOmega].every(Number.isFinite));
  }
 }
}
// Real firmware requires 2,000 stationary IMU calibration samples BEFORE
// it can accept any arming command. Never shortcut this state machine.
run(2200);
input.arm=true;
run(1200);
input.throttle=.45;
run(700);
assert.equal(fc.ticks,4100);
assert.ok(steps>=4100);
assert.ok(armedFrames>0,"genuine flight controller must accept arm after calibration: stateCounts="+JSON.stringify([...stateCounts])+" snapshots="+JSON.stringify(snapshots));
assert.ok(physics.motorOmega.every(x=>x>=0&&Number.isFinite(x)));
assert.ok(physics.batteryCurrent>=0&&Number.isFinite(physics.batteryCurrent));
const position=physics.position();
assert.ok(position.every(Number.isFinite),"authoritative Box3D should remain stable for all firmware ticks");
await fc.disconnect();
assert.ok(physics.dispose());
console.log(JSON.stringify({controller:"original-HIL1-SBUS-NAV1-flight-core-wasm",
 dynamics:"original-1kHz-box3d",firmwareFrames:steps,armedFrames,lastMotors:output.motors,position}));
