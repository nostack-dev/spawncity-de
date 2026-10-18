import assert from "node:assert/strict";
import {nativePopulationSnapshot} from "../sim/native_population_view.mjs";
const records=[
 {id:"b",x:5,y:0,yaw:.2,v:1.5,state:"walk",alive:true},
 {id:"a",x:-5,y:0,yaw:-.1,v:1.3,state:"walk",alive:true},
 {id:"frozen",x:1,y:0,yaw:0,alive:true,knocked:true},
 {id:"dead",x:0,y:0,yaw:0,alive:false},
 {id:"gone",x:0,y:1,yaw:0,alive:true,removed:true},
 {id:"far",x:250,y:0,yaw:0,alive:true},
 {id:"behind",x:2,y:0,yaw:0,alive:true}
];
const calls=[];
const heightAt=(x,y)=>{calls.push([x,y]);return x*.01+y*.02;};
const chosen=nativePopulationSnapshot(records,{center:[0,0],maxPeople:3,radius:100,heightAt});
assert.deepEqual(chosen.map(x=>x.id),["behind","a","b"],
 "only original live agents, nearest-first with stable identity tie-break");
assert.deepEqual(calls,[[2,0],[-5,0],[5,0]]);
assert.ok(chosen.every(x=>Number.isFinite(x.z)));
assert.equal(chosen[0].z,.02);
assert.equal(chosen[0].state,"wait");
records[0].x=1;
const next=nativePopulationSnapshot(records,{center:[0,0],maxPeople:3,radius:100,heightAt});
assert.equal(next[0].id,"b","same persistent agent identity follows its authoritative changed state");
records[0].alive=false;
assert.equal(nativePopulationSnapshot(records,{center:[0,0],maxPeople:3,radius:100,heightAt})[0].id,"behind");
assert.deepEqual(nativePopulationSnapshot(records,{maxPeople:0}),[]);
assert.throws(()=>nativePopulationSnapshot(records,{heightAt:()=>NaN}),/ground height/);
console.log("native crowd is same authoritative street agents without Three visibility slots or NPC replicas");
