import assert from "node:assert/strict";
import {nativeLampPoints,NativeStreetLamps} from "../sim/native_street_lamps.mjs";
const line={cls:"residential",w:8,pts:[[0,0],[0,100]]};
const points=nativeLampPoints([line]);
assert.ok(points.length>=2,"a straight OSM street gets more than one lamp");
for(let i=1;i<points.length;i++){
 const step=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
 assert.ok(step>33&&step<37,"opposite-side lamps stay near the 34 m spacing, got "+step);
}
assert.equal(nativeLampPoints([{cls:"path",w:2,pts:[[0,0],[0,80]]}]).length,0,"paths stay unlit");
const uploaded=new Map();
const renderer={
 upsert(id,data){uploaded.set(id,data);},
 remove(id){uploaded.delete(id);}
};
const lamps=new NativeStreetLamps(renderer,{heightAt:()=>2});
assert.equal(lamps.setRoads([line]),points.length);
assert.equal(uploaded.get("lamps/poles").instances.transforms.length/16,points.length);
assert.equal(uploaded.get("lamps/heads").material.unlit,true);
const lights={n:0,request(){this.n++;return true;}};
assert.equal(lamps.contribute(lights,[0,0,2]),Math.min(6,points.length));
lamps.clear();
assert.equal(uploaded.size,0);
console.log("native street lamps: OSM spacing, no paths, instanced poles, six nearest sodium lights");
