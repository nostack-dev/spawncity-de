import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nativeStereoRig,nativeStereoCameras,setStereoEnabled,renderNativeStereo,installStereo} from "../sim/stereo_sbs.mjs";
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,"expected "+b+" got "+a);
const cam={eye:[0,-10,2],target:[0,0,2],up:[0,0,1],fov:Math.PI/3,near:.1,far:1500};
const {left,right}=nativeStereoCameras(cam,{mode:"foot"});
near(left.eye[0],-.032);near(right.eye[0],.032);
near(left.target[0],0);near(right.target[0],0);
near(nativeStereoRig(cam,{mode:"foot"}).eyeSep,.064);
const calls=[];let current=null;
const renderer={
 gl:{},width:1001,height:549,
 setCamera(camera){current=camera;},
 render(args){calls.push({args,camera:current});return {drawCalls:2,triangles:36};}
};
installStereo(renderer);setStereoEnabled(false);renderer.setCamera(cam);
const mono=renderNativeStereo(renderer,cam,{mode:"drone"});
assert.equal(mono.drawCalls,2);assert.equal(calls.length,1);
assert.equal(calls[0].args,undefined);
calls.length=0;setStereoEnabled(true);
const stereo=renderNativeStereo(renderer,cam,{mode:"foot"});
assert.equal(stereo.stereo,true);
assert.equal(stereo.drawCalls,4);assert.equal(stereo.triangles,72);
assert.equal(calls.length,2);
assert.deepEqual(calls.map(x=>x.args.viewport),[
 {x:0,y:0,width:500,height:549},
 {x:500,y:0,width:501,height:549}
]);
assert.ok(calls[0].camera.eye[0]>0,"cross-eye places right camera on left viewport");
assert.ok(calls[1].camera.eye[0]<0);
assert.equal(current,cam,"restore primary game camera");
const vertical=nativeStereoCameras({...cam,target:[0,-10,22]},{mode:"jet"});
assert.ok(vertical.left.eye.every(Number.isFinite));
assert.ok(vertical.right.eye.every(Number.isFinite));
assert.throws(()=>nativeStereoCameras({...cam,target:cam.eye}),/degenerate/);
assert.throws(()=>renderNativeStereo({...renderer,width:1},cam),/nonzero/);
const throws={...renderer,render(){throw Error("GPU context lost");}};
assert.throws(()=>renderNativeStereo(throws,cam),/GPU context lost/);
assert.equal(current,cam);
const original=readFileSync("sim/stereo_sbs.mjs","utf8");
const presenter=readFileSync("sim/native_world_presenter.mjs","utf8");
assert.doesNotMatch(original,/from ["']three["']|THREE\.|\.threeRenderer|requestAnimationFrame\(wait\)/);
assert.match(presenter,/renderNativeStereo\(this\.renderer,this\.camera/);
assert.match(readFileSync("sim/native_scene_renderer.mjs","utf8"),/gl\.scissor\(rect\.x,rect\.y,rect\.width,rect\.height\)/);
setStereoEnabled(false);
console.log("Native stereo cross-eye cameras, exclusive WebGL2 viewport and state restoration OK.");
