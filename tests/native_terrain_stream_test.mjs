import assert from "node:assert/strict";
import {NativeTerrainStream} from "../sim/native_terrain_stream.mjs";
const live=new Map(),removed=[],uploadFrames=[];
const gpu={
 upsert(id,mesh){assert.ok(id.startsWith("osm/terrain:"));assert.ok(mesh.indices instanceof Uint16Array||mesh.indices instanceof Uint32Array);live.set(id,mesh);},
 remove(id){removed.push(id);live.delete(id);return true;}
};
const heightAt=(x,y)=>Math.sin(x/22)+Math.cos(y/16);
const stream=new NativeTerrainStream(gpu,{heightAt,listenPhysics:false,cells:8,step:5,radius:110,maxTiles:4,uploadsPerFrame:2});
const initial=await stream.update([10,10],{yieldFrame:async()=>uploadFrames.push(live.size)});
assert.equal(initial.uploaded,4);assert.equal(initial.chunks,4);
assert.deepEqual(uploadFrames,[2,4],"every two GPU tile updates must yield to input");
assert.equal(live.size,4);
const before=[...live.entries()].map(([id,t])=>[id,t.positions]);
const same=await stream.update([10,10],{yieldFrame:async()=>{throw Error("unnecessary frame yield");}});
assert.equal(same.uploaded,0);assert.equal(same.retained,4);
assert.ok(before.every(([id,positions])=>live.get(id)?.positions===positions),"unchanged terrain must retain exact GPU buffers");
stream.markDirty([[16,16,21,21]]);
const dirty=await stream.update([10,10],{yieldFrame:async()=>{}});
assert.equal(dirty.uploaded,1,"one crater must modify only its height-field tile");
assert.equal(dirty.retained,3);
const moved=await stream.update([500,0],{yieldFrame:async()=>{}});
assert.equal(moved.uploaded,4);assert.equal(moved.removed,4);
assert.equal(live.size,4,"old terrain GPU tiles must be released when moving");
stream.dispose();
assert.equal(live.size,0);
await assert.rejects(stream.update([0,0]),/disposed/);
console.log("Native Box3D visual terrain: 2 GPU uploads/frame, unchanged tile reuse, local crater invalidation, camera-driven eviction.");
