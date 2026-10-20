import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createNativeFlightPhysics,nativeDefaultFlightParams} from "../sim/native_flight_physics.mjs";
import {flightPresentationPose} from "../sim/native_airframe_presentation.mjs";

const modulePath=process.argv[2];
if(!modulePath)throw Error("usage: node tests/native_flight_physics_box3d_test.mjs <box3d.inline.mjs>");
const b3=await (await import(pathToFileURL(resolve(modulePath)).href)).default();
const params=nativeDefaultFlightParams();
const model=createNativeFlightPhysics(b3,params);
const assertFinite=values=>assert.ok(values.every(Number.isFinite),"non-finite physical Box3D pose: "+values);
const imu0=model.imuRaw(.001);
const rawImu=new DataView(imu0.buffer,imu0.byteOffset,imu0.byteLength);
const rawAccel=[2,4,6].map(i=>rawImu.getInt16(i,false));
const accelG=Math.hypot(...rawAccel)/2048;
assert.ok(accelG>.85&&accelG<1.15,"at-rest accelerometer must encode physical gravity (1 g), not NaN/0 g: "+JSON.stringify(rawAccel));

const atStart=model.state();
assertFinite([atStart.x,atStart.y,atStart.z,atStart.vx,atStart.vy,atStart.vz]);
assert.ok(atStart.z>=.02&&atStart.z<2,"airframe launches near real surface without clipping");
assertFinite(model.presentationPose(.5).position);
assertFinite(model.presentationPose(.5).quaternion);
const wire=model.imuRaw(.001);
assert.equal(wire.length,14,"genuine ICM IMU sample wire length");
const beforeBattery=model.batteryVoltage;
for(let t=0;t<1200;t++){
 model.step([1300,1300,1300,1300],.001);
 if(t%240===0){
  assertFinite(model.position());assertFinite(model.rotation());
  assertFinite(model.linear());assertFinite(model.angular());
  assertFinite(model.motorOmega);
 }
}
const flying=model.state();
assertFinite([flying.x,flying.y,flying.z,flying.vx,flying.vy,flying.vz]);
assert.ok(model.motorOmega.every(omega=>omega>0&&omega<100000),"motor model remains physical");
assert.ok(model.batteryVoltage>0&&model.batteryVoltage<=beforeBattery,"loaded battery cannot gain voltage");
assert.ok(model.batteryCurrent>=0&&Number.isFinite(model.batteryCurrent));
const v=model.presentationPose(.5);
const visual=flightPresentationPose(v);
assertFinite(visual.position);assertFinite(visual.quaternion);assertFinite(visual.velocity);
assert.ok(Math.abs(Math.hypot(...visual.quaternion)-1)<1e-4);
const ground=model.groundRange();
assert.equal(typeof ground.valid,"boolean","real Box3D rangefinder must be wired");
model.reset(params,{x:12,y:-9,z:2});
const afterReset=model.state();
assert.ok(Math.abs(afterReset.x-12)<.01&&Math.abs(afterReset.y+9)<.01,"reset uses authoritative rigid body");
assert.ok(afterReset.z>=1.9);
for(let i=0;i<240;i++)model.step([1000,1000,1000,1000],.001);
const afterIdle=model.state();
assertFinite([afterIdle.x,afterIdle.y,afterIdle.z,afterIdle.vx,afterIdle.vy,afterIdle.vz]);
assert.ok(model.dispose());
assert.ok(!model.dispose(),"native flight Box3D world is destroyed exactly once");
console.log(JSON.stringify({nativeFlight:"real-1kHz-upstream-box3d",ticks:1440,massKg:params.mass,
 batteryVoltageV:model.batteryVoltage,groundValid:ground.valid,afterReset,afterIdle}));
