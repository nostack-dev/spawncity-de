import assert from "node:assert/strict";
import {lookAt,perspective} from "../sim/native_render_math.mjs";
import {projectWorldPoint,worldCameraPose} from "../sim/world_camera_projection.mjs";
const close=(x,y)=>assert.ok(Math.abs(x-y)<1e-5,`${x} != ${y}`);
const eye=[0,0,2],target=[0,10,2],up=[0,0,1];
const native={eye,target,up,fov:Math.PI/2,near:.1,far:100};
const pose=worldCameraPose(native);
assert.deepEqual(pose.position,eye);
assert.deepEqual(pose.direction,[0,1,0]);
let pt=projectWorldPoint([0,10,2],native,{aspect:1});
assert.ok(pt?.inFront);close(pt.x,0);close(pt.y,0);
close(projectWorldPoint([10,10,2],native,{aspect:1}).x,1);
close(projectWorldPoint([10,10,2],native,{aspect:2}).x,.5);
assert.equal(projectWorldPoint([0,-3,2],native,{aspect:1}),null,"behind head must not leak screen bubbles");
assert.equal(projectWorldPoint([NaN,0,1],native),null);
assert.equal(projectWorldPoint([0,0,1],null),null);
// View/projection from the current production camera's numeric matrices.
const matrixWorld=new Float32Array([
 1,0,0,0,0,0,1,0,0,-1,0,0,0,0,2,1
]);
const legacy={
 position:{x:0,y:0,z:2},
 matrixWorld:{elements:matrixWorld},
 matrixWorldInverse:{elements:lookAt(eye,target,up)},
 projectionMatrix:{elements:perspective(Math.PI/2,1,.1,100)},
 updated:0,
 updateWorldMatrix(){this.updated++;}
};
const p=worldCameraPose(legacy);
assert.deepEqual(p.position,eye);
assert.deepEqual(p.direction,[0,1,0]);
pt=projectWorldPoint([4,10,2],legacy);
const np=projectWorldPoint([4,10,2],native,{aspect:1});
assert.ok(pt?.inFront);
close(pt.x,np.x);close(pt.y,np.y);close(pt.z,np.z);
assert.ok(legacy.updated>=2,"camera matrices must be current when reading the presented legacy view");
assert.equal(projectWorldPoint([0,-10,2],legacy),null);
assert.equal(worldCameraPose({position:{x:0,y:0,z:0}}),null);
assert.equal(projectWorldPoint([0,10,2],{eye:[0,0,2],target:[0,0,2],fov:1,near:.1,far:100}),null);
console.log("renderer-independent camera projection: identical Three matrix and native WebGL2 coordinates at portrait/landscape aspect");
