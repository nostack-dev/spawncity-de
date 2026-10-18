import assert from "node:assert/strict";
import {NativePeerVisuals} from "../sim/native_peer_visuals.mjs";
import {VsPoseTimeline} from "../sim/vs_pose_sync.mjs";

const meshes=new Map(),calls=[];
const gpu={
 upsert(id,mesh){calls.push(["upsert",id]);meshes.set(id,{mesh,instances:mesh.instances});},
 updateInstances(id,instances){assert.ok(meshes.has(id));calls.push(["update",id]);meshes.get(id).instances=instances;},
 remove(id){calls.push(["remove",id]);return meshes.delete(id);}
};
const timeline=new VsPoseTimeline({delayMs:0});
let connected=true,mode="drone";
const peer=new NativePeerVisuals(gpu,{timeline,connected:()=>connected,mode:()=>mode});
assert.equal(peer.update(1000).visible,false,"cannot draw a peer before a network pose");
assert.equal(meshes.size,0);
assert.equal(timeline.push({p:[2,3,8],q:[0,0,0,1],v:[0,0,0],t:1000},1000),true);
let state=peer.update(1000);
assert.equal(state.visible,true);
assert.deepEqual([...meshes.keys()],["vs/airframe","vs/rotors"]);
assert.ok(meshes.get("vs/airframe").mesh.positions.length>0);
assert.equal(meshes.get("vs/airframe").instances.transforms[12],2);
assert.equal(meshes.get("vs/airframe").instances.transforms[13],3);
assert.equal(meshes.get("vs/airframe").instances.transforms[14],8);
assert.equal(meshes.get("vs/rotors").instances.transforms.length,4*16);
assert.equal(calls.filter(c=>c[0]==="upsert").length,2,"one-time meshes; no per-frame allocations");
timeline.push({p:[5,6,9],q:[0,0,0,1],v:[0,0,0],t:1150},1150);
state=peer.update(1200);
assert.equal(state.visible,true);
assert.ok(Math.abs(meshes.get("vs/airframe").instances.transforms[12]-timeline.sample(1200).p[0])<1e-5,
 "native GPU must use the actual network-interpolated/extrapolated pose, not raw last-packet coordinates");
assert.equal(calls.filter(c=>c[0]==="upsert").length,2,"existing GPU buffers reused for each packet");
mode="foot";
assert.equal(peer.update(1220).visible,false,"foot mode must not render a second drone");
assert.equal(meshes.size,0);
mode="drone";
assert.equal(peer.update(1221).visible,true);
connected=false;
assert.equal(peer.update(6000).visible,false,"stale disconnected peer must disappear");
assert.equal(meshes.size,0);
assert.equal(peer.update(6100).visible,false);
peer.dispose();
assert.throws(()=>peer.update(7000),/disposed/);
console.log("native multiplayer timeline -> single WebGL2 peer visual: ok");
