import assert from "node:assert/strict";
import {NativeRoadStream} from "../sim/native_road_stream.mjs";
const gpu=new Map(),actions=[];
const renderer={
 upsert(id,mesh){assert.ok(id.startsWith("osm/roads:"));assert.ok(mesh.positions instanceof Float32Array);gpu.set(id,mesh);actions.push("add:"+id);},
 remove(id){gpu.delete(id);actions.push("del:"+id);}
};
let roadHeight=0;
const heightAt=()=>roadHeight;
const roads=[
 {properties:{class:"primary"},geometry:{type:"LineString",coordinates:[[0,0],[70,0]]}},
 {properties:{class:"secondary"},geometry:{type:"LineString",coordinates:[[0,15],[70,15]]}},
 {properties:{class:"path"},geometry:{type:"LineString",coordinates:[[4,30],[30,30]]}}
];
const stream=new NativeRoadStream(renderer,{heightAt,featuresPerStep:1,uploadsPerFrame:1,radius:250,chunkSize:40});
let waits=0;
const first=await stream.ingest(roads,{center:[0,0],revision:"roads:1",yieldFrame:async()=>{waits++;}});
assert.equal(first.roads,3);
assert.ok(first.uploaded>0);
assert.ok(waits>=first.uploaded);
const firstMesh=gpu.values().next().value;
assert.ok(firstMesh.positions.length>0);
const second=await stream.ingest(roads,{center:[10,0],revision:"roads:1"});
assert.equal(second.unchanged,true);
assert.equal(second.uploaded,0);
const invalidated=stream.invalidate();roadHeight=2;
const updated=await stream.ingest(roads,{center:[0,0],revision:"roads:1"});
assert.ok(updated.uploaded>0,"raised Box3D ground must update GPU road ribbons");
for(const mesh of gpu.values()){
 for(let i=2;i<mesh.positions.length;i+=3)
  assert.ok(mesh.positions[i]>=2,"road should be draped over current terrain");
}
const gone=await stream.ingest([],{center:[0,0],revision:"roads:2"});
assert.equal(gone.removed,first.chunks);
assert.equal(gpu.size,0,"removed OSM roads must free all GPU chunks");
stream.dispose();
await assert.rejects(stream.ingest([]),/disposed/);
console.log("Native-only road stream: layered transport features, deterministic GPU caching, Box3D height changes, updates and clean eviction passed.");
