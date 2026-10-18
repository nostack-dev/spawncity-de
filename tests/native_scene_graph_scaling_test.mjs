import assert from "node:assert/strict";
import {NativeSceneGraph} from "../sim/native_scene_graph.mjs";

const gpu={writes:[],visibility:[],failId:null,
 updateInstances(id,{transforms}){if(this.failId===id)throw Error("WebGL context unavailable");this.writes.push(id);assert.equal(transforms.length,16);},
 setVisible(id,value){this.visibility.push([id,value]);},
 remove(){return true;}
};
const graph=new NativeSceneGraph(gpu);
graph.add("world");
const N=2400;
for(let i=0;i<N;i++)graph.add("actor-"+i,{parent:"world",meshId:"gpu-"+i,position:[i,0,0]});
const initialized=graph.sync();
assert.equal(initialized.nodes,N+1);
assert.equal(initialized.visited,N+1);
assert.equal(initialized.worldMatrices,N+1);
assert.equal(gpu.writes.length,N);
const idle=graph.sync();
assert.equal(idle.visited,0,"idle native hierarchy must not visit every object per frame");
assert.equal(idle.worldMatrices,0);
const before=gpu.writes.length;
graph.setTransform("actor-1739",{position:[15,12,3]});
const changed=graph.sync();
assert.equal(changed.visited,1);
assert.equal(changed.worldMatrices,1);
assert.equal(gpu.writes.length,before+1);
assert.equal(gpu.writes.at(-1),"gpu-1739");
graph.setTransform("world",{position:[10,0,0]});
const moved=graph.sync();
assert.equal(moved.visited,N+1,"changed parent must still update every affected child");
assert.equal(moved.worldMatrices,N+1);
assert.equal(graph.worldMatrix("actor-1739")[12],25);
const stable=graph.sync();
assert.equal(stable.visited,0);
const writeCount=gpu.writes.length;
graph.setVisible("actor-1739",false);
assert.equal(graph.sync().visited,1);
assert.equal(gpu.writes.length,writeCount,"hidden mesh may not upload transform matrices");
graph.setVisible("actor-1739",true);
graph.sync();
assert.equal(gpu.writes.length,writeCount+1);
gpu.failId="gpu-8";
graph.setTransform("actor-8",{position:[11,14,9]});
assert.throws(()=>graph.sync(),/WebGL context unavailable/);
gpu.failId=null;
const recovered=graph.sync();
assert.equal(recovered.visited,1,"failed GPU update must be retried, not silently lost");
assert.equal(gpu.writes.at(-1),"gpu-8");
graph.remove("actor-8");
assert.equal(graph.sync().visited,0);
graph.dispose();
assert.equal(graph.nodes.size,0);
assert.equal(graph.pendingRoots.size,0);
console.log(JSON.stringify({pass:true,actors:N,idleVisited:idle.visited,singleActorVisited:changed.visited,parentVisited:moved.visited,retryAfterGpuLoss:recovered.visited}));
