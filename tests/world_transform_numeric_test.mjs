import assert from "node:assert/strict";
import {fromTRS} from "../sim/native_render_math.mjs";
import {worldRootPose,worldVisualBottom} from "../sim/world_transform_numeric.mjs";
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const rotZ=t=>[0,0,Math.sin(t/2),Math.cos(t/2)];
const m=fromTRS([7,-2,4],rotZ(.7),[2,3,1]);
const root={matrixWorld:{elements:m},updateWorldMatrixCalls:0,updateWorldMatrix(){this.updateWorldMatrixCalls++;}};
const pose=worldRootPose(root);
close(pose.x,7);close(pose.y,-2);close(pose.yaw,.7);assert.equal(pose.pitch,0);
assert.equal(root.updateWorldMatrixCalls,1);
const under=fromTRS([7,-2,-3],rotZ(.7),[2,3,1]);
const upright=fromTRS([7,-2,4],rotZ(.7),[2,3,1]);
let computed=0;
const box={min:{x:-1,y:-2,z:-.5},max:{x:1,y:2,z:1}};
const children=[
 {matrixWorld:{elements:under},geometry:{boundingBox:box}},
 {matrixWorld:{elements:upright},geometry:{computeBoundingBox(){computed++;this.boundingBox=box;}}}
];
const scene={updateMatrixWorldCalls:0,updateMatrixWorld(){this.updateMatrixWorldCalls++;},
 traverse(callback){callback(this);for(const child of children)callback(child);}};
close(worldVisualBottom(scene),-3.5);
assert.equal(scene.updateMatrixWorldCalls,1);
assert.equal(computed,1);
const halfTurn=fromTRS([0,0,10],[Math.sin(Math.PI/4),0,0,Math.cos(Math.PI/4)]);
const vertical={matrixWorld:{elements:halfTurn},geometry:{boundingBox:{min:{x:0,y:1,z:-1},max:{x:1,y:3,z:1}}}};
close(worldVisualBottom(vertical),11); // rotating local +Y by +90deg points toward +Z
assert.equal(worldVisualBottom(null),null);
assert.equal(worldRootPose(null),null);
assert.equal(worldVisualBottom({geometry:{boundingBox:{min:{x:NaN,y:0,z:0},max:{x:1,y:1,z:1}}}}),null);
console.log("world-space reset yaw and airborne visual bounds match the original scene coordinate system without THREE");
