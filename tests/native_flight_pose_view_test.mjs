import assert from "node:assert/strict";
import {nativeFlightPoseView,interpolateNativeQuaternion} from "../sim/native_flight_pose_view.mjs";
import {NativeAirframePresentation} from "../sim/native_airframe_presentation.mjs";
const near=(actual,want)=>assert.ok(Math.abs(actual-want)<1e-5,`${actual} != ${want}`);
const model={
 p:{span:.25,propD:.11},motorOmega:[70,80,90,100],
 renderPreviousPosition:[0,0,8],renderCurrentPosition:[10,4,10],
 renderPreviousRotation:[0,0,0,1],
 renderCurrentRotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],
 renderPreviousVelocity:[0,0,0],renderCurrentVelocity:[2,4,0]
};
let fraction=.5;
const view=nativeFlightPoseView(model,{alpha:()=>fraction});
const pose=view.presentationPose();
assert.deepEqual(pose.position,[5,2,9]);
assert.deepEqual(pose.velocity,[1,2,0]);
near(pose.quaternion[2],Math.sin(Math.PI/8));
near(pose.quaternion[3],Math.cos(Math.PI/8));
const negEnd=model.renderCurrentRotation.map(v=>-v);
const shortArc=interpolateNativeQuaternion(model.renderPreviousRotation,negEnd,.5);
near(Math.abs(shortArc[2]),pose.quaternion[2]);
near(Math.abs(shortArc[3]),pose.quaternion[3]);
const gpu={
 updated:[],camera:null,
 upsert(){},remove(){},
 updateInstances(id,data){this.updated.push({id,data});},
 setCamera(value){this.camera=value;}
};
const airframe=new NativeAirframePresentation(gpu,{span:view.p.span,propD:view.p.propD});
const frame=airframe.update(view.presentationPose(),{mode:"fpv",motors:view.motorOmega,dt:1/60});
near(frame.position[0],5);near(frame.position[1],2);near(frame.position[2],9);
near(gpu.updated.find(x=>x.id==="flight/airframe").data.transforms[12],5);
assert.equal(gpu.updated.find(x=>x.id==="flight/rotors").data.transforms.length,64);
fraction=1;model.renderCurrentPosition[0]=25;model.motorOmega[0]=120;
near(view.presentationPose().position[0],25);
assert.equal(view.motorOmega[0],120,"live motor speeds must never be frozen in adapter");
fraction=NaN;
assert.throws(()=>view.presentationPose(),/interpolation/);
airframe.dispose();
assert.throws(()=>nativeFlightPoseView({}),/PhysicsModel/);
console.log("native 1 kHz PhysicsModel snapshot interpolation and drone FPV graphics bridge: ok");
