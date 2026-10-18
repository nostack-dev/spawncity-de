import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {NativeCombatEvents} from "../sim/native_combat_events.mjs";
const handlers=new Map(),emitted=[],problems=[];
const target={
 addEventListener(name,listener){assert.ok(!handlers.has(name),"no duplicate native combat listener "+name);handlers.set(name,listener);},
 removeEventListener(name,listener){assert.equal(handlers.get(name),listener);handlers.delete(name);},
 dispatch(name,detail){handlers.get(name)?.({detail});}
};
let now=1000;
const world={camera:{eye:[0,-10,2],target:[0,0,2]},emitEffect(event){emitted.push(event);return emitted.length;}};
const bridge=new NativeCombatEvents(world,{target,clock:()=>now,onError:e=>problems.push(e)});
assert.equal(bridge.connect(),true);assert.equal(bridge.connect(),false);
assert.equal(handlers.size,3);
target.dispatch("arondight:weapon-fired",{weapon:"smg",intensity:.5,source:"foot-screen",mode:"foot"});
assert.equal(emitted.length,1);assert.equal(emitted[0].kind,"muzzle");
assert.ok(emitted[0].position[1]>-10&&emitted[0].position[1]<-9);
target.dispatch("arondight:weapon-fired",{weapon:"smg",intensity:.5,mode:"foot"});
assert.equal(emitted.length,1,"duplicate 25-ms gun events must not allocate FX");
now=1030;
target.dispatch("arondight:foot-tracer",{start:[0,0,2],end:[0,24,2],weapon:"smg",hand:0});
assert.equal(emitted.length,2);assert.equal(emitted[1].kind,"tracer");
assert.deepEqual(emitted[1].position,[0,0,2]);assert.ok(Math.abs(emitted[1].velocity[1]-240)<1e-6);
assert.equal(emitted[1].lifeMs,100);
target.dispatch("arondight:world-explosion",{position:[1,2,3],radiusM:9.5,maxDamage:160,kind:"missile"});
assert.equal(emitted.length,4);
assert.deepEqual(emitted.slice(2).map(x=>x.kind),["blast","smoke"]);
assert.deepEqual(emitted[2].position,[1,2,3]);
target.dispatch("arondight:world-explosion",{position:[NaN,0,0],radiusM:8});
target.dispatch("arondight:foot-tracer",{start:[0,0,0],end:[0,0,0]});
target.dispatch("arondight:weapon-fired",{weapon:"smg",mode:"unknown"});
assert.equal(emitted.length,4);assert.equal(bridge.rejected,3);
assert.equal(bridge.received,4);
const invalid={...world,camera:null};
const other=new NativeCombatEvents(invalid,{target:null});
assert.equal(other.connect(),false);other.dispose();
assert.equal(bridge.disconnect(),true);assert.equal(handlers.size,0);
assert.equal(bridge.disconnect(),false);
assert.equal(bridge.connect(),true);assert.equal(handlers.size,3);
bridge.dispose();bridge.dispose();
assert.equal(handlers.size,0);
target.dispatch("arondight:world-explosion",{position:[0,0,0]});
assert.equal(emitted.length,4,"disposing native scene must remove real game event listeners");
assert.throws(()=>bridge.connect(),/disposed/);
assert.deepEqual(problems,[]);
const original=readFileSync("sim/gameplay_final_runtime_v2.mjs","utf8");
for(const name of ["arondight:weapon-fired","arondight:foot-tracer","arondight:world-explosion"])
 assert.ok(original.includes("new CustomEvent(\""+name+"\""),"actual gameplay runtime must own event contract "+name);
console.log("Native combat bridge: actual game event contracts, one WebGL2 FX source, particle timings, damage untouched, no event leaks.");
