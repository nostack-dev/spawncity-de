import assert from "node:assert/strict";
import {NativeCityStream} from "../sim/native_city_stream.mjs";
const writes=[],removed=[];
const scene={
  upsert(id,mesh){assert.ok(id.startsWith("osm/city:"));assert.ok(mesh.positions instanceof Float32Array);writes.push({id,mesh});},
  remove(id){removed.push(id);return true;}
};
const square=(x,y,key,height=15)=>({
  key,outer:[[x,y],[x+10,y],[x+10,y+10],[x,y+10]],holes:[],base:0,top:height,center:[x+5,y+5]
});
const a=square(0,0,"A"),b=square(210,0,"B");
const stream=new NativeCityStream(scene,{chunkSize:100,buildingsPerStep:1});
const first=await stream.ingestFootprints([a,b]);assert.equal(first.built,2);
assert.equal(first.uploaded,2);assert.equal(first.chunks,2);
assert.equal(writes.length,2);
const unchanged=await stream.ingestFootprints([a,b]);
assert.equal(unchanged.unchanged,true);assert.equal(writes.length,2);
const reverse=await stream.ingestFootprints([b,a]);assert.equal(reverse.unchanged,true,"feature ordering cannot force uploads");
const changed=await stream.ingestFootprints([a,b],{revision:"explosion#1",damageTop:fp=>fp.key==="A"?fp.top-4:fp.top});
assert.equal(changed.uploaded,1,"damage should upload only affected chunk");
const height=changed.uploaded&&writes.at(-1).mesh.positions.filter((v,i)=>i%3===2);
assert.ok(Math.max(...height)<=11.001,"crater cap affects actual GPU mesh");
const gone=await stream.ingestFootprints([b]);assert.equal(gone.removed,1);
assert.ok(removed.some(id=>id.includes("0,0")),"old chunk must be evicted after streaming");
stream.dispose();await assert.rejects(stream.ingestFootprints([]),/disposed/);
const asyncStream=new NativeCityStream(scene,{chunkSize:100,buildingsPerStep:1});
let release;
const stalled=new Promise(resolve=>{release=resolve});
const slow=asyncStream.ingestFootprints([a,b],{yieldFrame:()=>stalled});
const newest=await asyncStream.ingestFootprints([b],{revision:"new"});
assert.equal(newest.uploaded,1);
release();assert.equal((await slow).cancelled,true,"stale asynchronous data may never overwrite current city");
asyncStream.dispose();
// GPU uploads must yield to browser input/paint, rather than blocking one frame.
const frameWrites=[],frameSamples=[],frameRemoved=[];
const budgetRenderer={
 upsert(id){frameWrites.push(id);},
 remove(id){frameRemoved.push(id);return true;}
};
const budget=new NativeCityStream(budgetRenderer,{chunkSize:100,buildingsPerStep:20,uploadsPerFrame:1});
const budgetResult=await budget.ingestFootprints([a,b],{yieldFrame:async()=>{frameSamples.push(frameWrites.length);}});
assert.equal(budgetResult.uploaded,2);
assert.deepEqual(frameSamples,[1,2],"GPU uploads should be split across frame boundaries");
budget.dispose();
// A superseding fetch during GPU upload cannot leak a chunk: the previous
// upload was tracked immediately and the new snapshot removes it.
const liveIds=new Set(),throttleRenderer={
 upsert(id){liveIds.add(id);},
 remove(id){liveIds.delete(id);return true;}
};
const throttled=new NativeCityStream(throttleRenderer,{chunkSize:100,buildingsPerStep:20,uploadsPerFrame:1});
let unblock;
const blockingFrame=new Promise(resolve=>{unblock=resolve;});
const superseded=throttled.ingestFootprints([a,b],{yieldFrame:()=>blockingFrame});
assert.ok(liveIds.size===1,"one chunk staged before yielding");
const newer=await throttled.ingestFootprints([b],{yieldFrame:async()=>{}});
assert.equal(newer.chunks,1);
unblock();assert.equal((await superseded).cancelled,true);
assert.equal(liveIds.size,1,"superseded GPU upload must not leak a stale chunk");
throttled.dispose();
const gpuUploads=writes.length;
assert.ok(gpuUploads<8,"chunk hash must avoid repeated GPU uploads");
console.log("Native-only OSM renderer stream: stable hashes, crater updates, async cancellation, stale chunk eviction, no duplicate buffer upload:",gpuUploads);
