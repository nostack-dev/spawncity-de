import assert from "node:assert/strict";
import {NativePedestrianVisuals} from "../sim/native_pedestrian_visuals.mjs";
const events=[],state=new Map();
const renderer={
 upsert(id,input){
  assert.equal(id,"actors/pedestrians");assert.ok(input.positions instanceof Float32Array);
  assert.equal(input.positions.length,input.normals.length);assert.equal(input.positions.length,input.colors.length);
  assert.equal(input.uvs.length,input.positions.length/3*2);
  state.set(id,input.instances);events.push("upsert");
 },
 updateInstances(id,instances){assert.ok(state.has(id));state.set(id,instances);events.push("update");},
 remove(id){state.delete(id);events.push("remove");}
};
const a={id:"ped-A",x:0,y:0,z:1,yaw:0};
const b={id:"ped-B",x:3,y:4,z:2,yaw:Math.PI/2};
const people=[a,b];
const presenter=new NativePedestrianVisuals(renderer,{people:()=>people});
const first=presenter.update();
assert.equal(first.visible,2);assert.equal(first.drawCalls,1);
assert.equal(events[0],"upsert");
const tr=state.get("actors/pedestrians").transforms;
assert.equal(tr[12],0);assert.equal(tr[13],0);assert.equal(tr[14],1);
assert.ok(Math.abs(tr[16+12]-3)<1e-7);
assert.ok(Math.abs(tr[16+0])<1e-5,"character yaw must follow persistent route");
a.x=10;
assert.equal(presenter.update().visible,2);
assert.equal(state.get("actors/pedestrians").transforms[12],10);
assert.deepEqual(events.slice(0,2),["upsert","update"],"no geometry reallocation on each AI tick");
people.splice(0,people.length);
assert.equal(presenter.update().visible,0);
assert.equal(state.size,0);
presenter.dispose();
assert.throws(()=>presenter.update(),/disposed/);
console.log("Native persistent people: 2 AI agents in one instanced draw, live pose/yaw updates without mesh rebuild, clean eviction.");
