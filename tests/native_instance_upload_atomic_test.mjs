import assert from "node:assert/strict";
import {NativeSceneRenderer} from "../sim/native_scene_renderer.mjs";
import {identity4} from "../sim/native_render_math.mjs";

const oldMat=identity4();oldMat[12]=3;
const oldTint=new Float32Array([1,1,1,1]);
const oldNormal=new Float32Array([1,0,0,0,1,0,0,0,1]);
const oldData={transforms:oldMat,tints:oldTint,instanceNormals:oldNormal,count:1};
const m={
 id:"box3d/car",data:oldData,visible:true,material:{alphaMode:"opaque",castShadow:true},
 localBounds:{center:[0,0,0],radius:1},
 worldBounds:{center:[3,0,0],radius:1},bvh:{real:"old"},
 buffers:[null,null,null,null,"transforms","tints","normals"],
 capTransforms:16,capTints:4,capNormals:9
};
const bufferStorage=new Map([
 ["transforms",new Float32Array(oldMat)],
 ["tints",new Float32Array(oldTint)],
 ["normals",new Float32Array(oldNormal)]
]);
let bound=null,failTintOnce=true,allocations=0;
const gl={
 ARRAY_BUFFER:34962,DYNAMIC_DRAW:35048,
 bindBuffer(target,id){assert.equal(target,this.ARRAY_BUFFER);bound=id;},
 bufferData(target,values){
  assert.equal(target,this.ARRAY_BUFFER);
  allocations++;
  if(typeof values==="number")bufferStorage.set(bound,new Float32Array(values/4));
  else bufferStorage.set(bound,new Float32Array(values));
 },
 bufferSubData(target,offset,values){
  assert.equal(target,this.ARRAY_BUFFER);assert.equal(offset,0);
  if(bound==="tints"&&failTintOnce){failTintOnce=false;throw Error("simulated WebGL upload error");}
  bufferStorage.get(bound).set(values);
 }
};
const renderer=Object.create(NativeSceneRenderer.prototype);
renderer.meshes=new Map([[m.id,m]]);
renderer.sceneRevision=5;renderer.shadowRevision=8;
renderer.lost=false;renderer.gl=gl;
const next1=identity4(),next2=identity4();next1[12]=9;next2[12]=12;
const transforms=new Float32Array([...next1,...next2]);
const tints=new Float32Array([1,0,0,1,0,1,0,1]);
assert.throws(()=>renderer.updateInstances(m.id,{transforms,tints}),/simulated WebGL upload error/);
assert.equal(renderer.sceneRevision,5,"CPU scene revision cannot advance on GPU upload failure");
assert.equal(renderer.shadowRevision,8,"sun depth must stay valid after full rollback");
assert.equal(m.data,oldData,"failed draw must retain authoritative old pose object");
assert.equal(m.bvh.real,"old","failed upload must not erase valid prior BVH");
assert.equal(m.capTransforms,16);assert.equal(m.capTints,4);assert.equal(m.capNormals,9);
assert.deepEqual([...bufferStorage.get("transforms")],[...oldMat]);
assert.deepEqual([...bufferStorage.get("tints")],[...oldTint]);
assert.deepEqual([...bufferStorage.get("normals")],[...oldNormal]);
assert.equal(bound,null,"GL state must be unbound on error");
const countBefore=allocations;
assert.equal(renderer.updateInstances(m.id,{transforms,tints}),true);
assert.equal(renderer.sceneRevision,6);
assert.equal(renderer.shadowRevision,9);
assert.equal(m.data.count,2);
assert.equal(m.data.transforms[12],9);
assert.equal(m.data.transforms[28],12);
assert.equal(m.capTransforms,32);assert.equal(m.capTints,8);assert.equal(m.capNormals,18);
assert.deepEqual([...bufferStorage.get("transforms")],[...transforms]);
assert.deepEqual([...bufferStorage.get("tints")],[...tints]);
assert.ok(allocations>countBefore,"new instance capacity is allocated only on legitimate growth");
assert.equal(bound,null);
assert.equal(renderer.updateInstances(m.id,{transforms:new Float32Array(transforms),tints:new Float32Array(tints)}),false,
 "unchanged instance buffers must not be re-uploaded each frame");
console.log("native WebGL2 GPU instance upload fails atomically; Box3D hit ID, BVH, shadow and old buffers survive");
