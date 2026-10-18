import assert from "node:assert/strict";
import {NativeEffects} from "../sim/native_effects.mjs";
const actions=[],live=new Map();
const renderer={
 upsert(id,mesh){assert.equal(id,"fx/particles");assert.equal(mesh.material.alphaMode,"blend");live.set(id,mesh);actions.push(["create",id]);},
 updateInstances(id,instances){assert.ok(live.has(id));assert.equal(instances.transforms.length%16,0);live.get(id).instances=instances;actions.push(["update",id,instances.transforms.length/16]);},
 remove(id){live.delete(id);actions.push(["remove",id]);return true;}
};
const fx=new NativeEffects(renderer,{maxParticles:2});
const one=fx.emit({kind:"muzzle",position:[0,0,3],startMs:1000,lifeMs:200,size:.3});
const two=fx.emit({kind:"smoke",position:[2,0,5],velocity:[0,0,1],startMs:1000,lifeMs:1200,size:1});
assert.ok(one>0&&two>one);
assert.equal(fx.emit({kind:"spark",position:[0,0,0],startMs:1000}),null,"bounded particle pool");
assert.equal(fx.stats.dropped,1);
assert.throws(()=>fx.emit({kind:"smoke",position:[NaN,0,0]}),/position/);
assert.throws(()=>fx.emit({kind:"invalid",position:[0,0,0]}),/kind/);
const first=fx.tick(1000,[0,-10,8]);
assert.equal(first.active,2);assert.equal(live.size,1,"must batch particles in one GPU mesh");
const mesh=live.get("fx/particles");
assert.equal(mesh.instances.transforms.length,32);
assert.equal(mesh.instances.tints.length,8);
assert.ok(mesh.instances.tints[3]>0&&mesh.instances.tints[7]>0);
const second=fx.tick(1150,[0,-10,8]);
assert.equal(second.active,2);
assert.equal(actions.filter(x=>x[0]==="create").length,1,"no GL buffer recreation on each effect frame");
const update=live.get("fx/particles").instances;
assert.ok(Array.from(update.tints).some(x=>x>0&&x<.6),"particle opacity must decay");
const third=fx.tick(1250,[0,-10,8]);
assert.equal(third.active,1);
assert.equal(live.get("fx/particles").instances.transforms.length,16);
const clear=fx.tick(2300,[0,-10,8]);
assert.equal(clear.active,0);assert.equal(live.size,0);
assert.ok(actions.some(x=>x[0]==="remove"));
const noop=fx.tick(2400,[0,-10,8]);assert.equal(noop.uploaded,0,"idle FX do no GPU writes");
fx.dispose();fx.dispose();
assert.throws(()=>fx.emit({kind:"blast",position:[0,0,0]}),/disposed/);
console.log("Native WebGL2 effects: one batch, deterministic muzzle/smoke fade, budget cap, no idle upload, GPU cleanup passed.");
