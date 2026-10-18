import assert from "node:assert/strict";
import {NativeAirframePresentation,flightPresentationPose,rotateByQuaternion} from "../sim/native_airframe_presentation.mjs";
const calls={upserts:[],instances:[],camera:[],removes:[]};
const scene={
 upsert(id,mesh){calls.upserts.push({id,mesh});},
 updateInstances(id,data){calls.instances.push({id,data});},
 setCamera(data){calls.camera.push(data);},
 remove(id){calls.removes.push(id);}
};
const near=(actual,want)=>assert.ok(Math.abs(actual-want)<.0001,String(actual)+" != "+want);
const flight=new NativeAirframePresentation(scene,{span:.25,propD:.11});
assert.deepEqual(calls.upserts.map(x=>x.id),["flight/airframe","flight/rotors"]);
assert.ok(calls.upserts[0].mesh.positions.length>200,"real arm/body geometry required");
assert.equal(calls.upserts[1].mesh.instances.transforms.length,64);
assert.ok(calls.upserts[1].mesh.instances.transforms.every(Number.isFinite));
const pose={position:{x:4,y:7,z:12},quaternion:{x:0,y:0,z:0,w:1},velocity:{x:1,y:2,z:0}};
const first=flight.update(pose,{mode:"fpv",fpvTiltDeg:0,fpvFovDeg:105,motors:[100,200,100,200]});
near(first.eye[0],3.898);near(first.eye[1],7);near(first.eye[2],12.028);
near(first.target[0],first.eye[0]-4);near(first.target[2],first.eye[2]);
near(calls.camera.at(-1).near,.02);near(calls.camera.at(-1).fov,105*Math.PI/180);
assert.equal(calls.instances.length,2);
assert.equal(calls.instances[0].data.transforms.length,16);
assert.equal(calls.instances[1].data.transforms.length,64);
assert.ok(calls.instances[1].data.transforms.every(Number.isFinite));
near(calls.instances[0].data.transforms[12],4);
near(calls.instances[0].data.transforms[13],7);
const angled=flight.update(pose,{mode:"fpv",fpvTiltDeg:20,motors:[100,200,100,200]});
assert.ok(angled.target[2]>angled.eye[2],"positive FPV camera mount tilt points up");
const follow=flight.update(pose,{mode:"follow"});
// Production chase framing intentionally moved farther behind and higher
// to preserve the real Box3D horizon; test physical sightline bounds rather
// than freezing the previous, ground-filled camera art direction.
assert.ok(follow.eye[0]>pose.position.x+2.3&&follow.eye[0]<pose.position.x+3.2,
 "native follow must stand behind the actual -X-forward drone");
assert.ok(follow.eye[2]>pose.position.z+1.15&&follow.eye[2]<pose.position.z+1.8,
 "native follow must expose the real terrain/horizon above physical craft");
assert.ok(follow.target[2]<follow.eye[2],
 "chase optics must look toward real aircraft and world, not empty zenith");
near(calls.camera.at(-1).near,.06);
const third=flight.update(pose,{mode:"third",thirdDistanceM:2.48});
assert.ok(third.eye[0]>follow.eye[0],"third camera must be farther behind drone");
assert.ok(third.eye[2]>follow.eye[2],"third camera elevated");
near(calls.camera.at(-1).fov,62*Math.PI/180);
const rotated={position:[0,0,4],quaternion:[0,0,Math.SQRT1_2,Math.SQRT1_2],velocity:[0,0,0]};
const yaw=flight.update(rotated,{mode:"fpv",fpvTiltDeg:0});
assert.ok(yaw.target[1]<yaw.eye[1]-3.99,"90 degree yaw must rotate -X forward to -Y");
const euler=flightPresentationPose({x:0,y:0,z:5,attitude:[0,0,90]});
near(rotateByQuaternion([-1,0,0],euler.quaternion)[1],-1);
assert.throws(()=>flightPresentationPose({x:0,y:0,z:1,attitude:[NaN,0,0]}));
assert.throws(()=>flight.update(pose,{mode:"unknown"}));
const corrected=flight.update(pose,{mode:"follow",collisionResolve:(_anchor,_desired)=>({position:[5,5,15]})});
assert.deepEqual(corrected.eye,[5,5,15]);
flight.dispose();assert.deepEqual(calls.removes,["flight/airframe","flight/rotors"]);
console.log("Native Box3D drone: exact FPV optical offsets/tilt, follow/third inertial camera, quaternion yaw, animated rotor buffers and dispose passed.");
