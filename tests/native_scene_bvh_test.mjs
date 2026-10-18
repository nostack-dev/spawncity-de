import assert from "node:assert/strict";
import {nativeBuildBvh,nativeBvhTriangles,nativeRayAabb} from "../sim/native_scene_bvh.mjs";
import {pickNativeMeshes} from "../sim/native_scene_picking.mjs";
import {geometryBoundingSphere,instancedBoundingSphere} from "../sim/native_render_culling.mjs";
import {identity4} from "../sim/native_render_math.mjs";
const side=80,verts=[],idx=[];
for(let y=0;y<=side;y++)for(let x=0;x<=side;x++)verts.push(x,y,0);
for(let y=0;y<side;y++)for(let x=0;x<side;x++){
 const a=y*(side+1)+x,b=a+1,c=a+side+1,d=c+1;
 idx.push(a,b,d,a,d,c);
}
const positions=new Float32Array(verts),indices=new Uint16Array(idx);
const bvh=nativeBuildBvh(positions,indices);
assert.equal(bvh.faces,side*side*2);
assert.ok(bvh.nodes.length>100);
assert.equal(nativeRayAabb([0,0,20],[0,0,-1],[0,0,0],[80,80,0],20),true);
assert.equal(nativeRayAabb([100,100,20],[0,0,-1],[0,0,0],[80,80,0],20),false);
const ray={origin:[36.33,22.78,30],direction:[0,0,-1]};
const candidates=nativeBvhTriangles(bvh,ray.origin,ray.direction,50);
assert.ok(candidates.length<50,"BVH must inspect fewer than 50 of 12800 triangles");
const local=geometryBoundingSphere(positions),t=identity4();
const mesh={id:"terrain",visible:true,material:{doubleSided:true},data:{p:positions,indices,transforms:t,count:1},worldBounds:instancedBoundingSphere(local,t),bvh};
const accelerated=pickNativeMeshes([mesh],ray,{maxDistance:50});
delete mesh.bvh;
const brute=pickNativeMeshes([mesh],ray,{maxDistance:50});
assert.equal(accelerated.hit?.id,"terrain");
assert.equal(brute.hit?.id,accelerated.hit?.id);
assert.ok(Math.abs(brute.hit.distance-accelerated.hit.distance)<1e-7);
assert.ok(Math.abs(accelerated.hit.point[0]-ray.origin[0])<1e-5);
assert.ok(Math.abs(accelerated.hit.point[1]-ray.origin[1])<1e-5);
assert.ok(accelerated.trianglesExamined<brute.trianglesExamined*.01,
  "BVH must skip >=99% of static terrain triangles: "+accelerated.trianglesExamined+" vs "+brute.trianglesExamined);
const miss=pickNativeMeshes([{...mesh,bvh}],{origin:[100,100,30],direction:[0,0,-1]});
assert.equal(miss.hit,null);
assert.throws(()=>nativeBuildBvh(new Float32Array([0,0,0])));
assert.throws(()=>nativeBuildBvh(positions,new Uint16Array([0,1,65535])));
console.log(JSON.stringify({pass:true,triangles:bvh.faces,nodes:bvh.nodes.length,bvhCandidates:candidates.length,bvhExamined:accelerated.trianglesExamined,bruteExamined:brute.trianglesExamined,reductionPercent:100*(1-accelerated.trianglesExamined/brute.trianglesExamined)}));
