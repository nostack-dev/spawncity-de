import assert from "node:assert/strict";
import {NativeSceneRenderer} from "../sim/native_scene_renderer.mjs";

const identityCount=count=>{
 const transforms=new Float32Array(count*16),tints=new Float32Array(count*4);
 for(let i=0;i<count;i++){for(let j=0;j<4;j++)transforms[i*16+j*5]=1;tints.set([1,1,1,1],i*4);}
 return {transforms,tints};
};
const initial=identityCount(1);
const calls=[];
const gl={
 ARRAY_BUFFER:34962,DYNAMIC_DRAW:35048,
 bindBuffer(target,buffer){calls.push(["bindBuffer",buffer]);},
 bufferData(target,size,usage){calls.push(["bufferData",size]);},
 bufferSubData(target,offset,data){calls.push(["bufferSubData",data.length]);}
};
const r=Object.create(NativeSceneRenderer.prototype);
r.meshes=new Map([["traffic",{
 data:{...initial,normals:new Float32Array(9),count:1},
 localBounds:{center:[0,0,0],radius:1},worldBounds:{center:[0,0,0],radius:1},
 buffers:[null,null,null,null,"transforms","tints","normals"],
 capTransforms:16,capTints:4,capNormals:9,bvh:null
}]]);
r.gl=gl;r.sceneRevision=1;r.lost=false;
const reallocs=()=>calls.filter(c=>c[0]==="bufferData");
r.updateInstances("traffic",identityCount(2));
assert.deepEqual(reallocs().map(c=>c[1]),[32*4,8*4,18*4]);
assert.equal(r.meshes.get("traffic").data.count,2);
r.updateInstances("traffic",identityCount(1));
r.updateInstances("traffic",identityCount(2));
assert.equal(reallocs().length,3,"decreasing/regrowing instance count inside capacity must not reallocate");
r.updateInstances("traffic",identityCount(3));
assert.deepEqual(reallocs().slice(-3).map(c=>c[1]),[64*4,16*4,36*4],"each GPU buffer should grow geometrically");
assert.equal(r.meshes.get("traffic").data.count,3);
assert.equal(calls.filter(c=>c[0]==="bufferSubData").length,12,"every changed buffer must be uploaded to existing GPU storage");
console.log("native traffic instance GPU buffer capacity reuse: ok");
