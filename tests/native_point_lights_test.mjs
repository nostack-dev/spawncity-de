import assert from "node:assert/strict";
import {NativePointLightPool,NATIVE_LIGHT_BUDGET} from "../sim/native_point_lights.mjs";
import {NativeSceneRenderer} from "../sim/native_scene_renderer.mjs";
import {NativeWorldPresenter} from "../sim/native_world_presenter.mjs";

const pool=new NativePointLightPool();
assert.equal(NATIVE_LIGHT_BUDGET,6);
assert.equal(pool.resolve([0,0,0]).count,0,"no stray idle flash lights");
const requests=[
 {at:[2,0,1],hex:0xff0022,power:9},
 {at:[10,0,1],hex:0x00ff00,power:12},
 {at:[30,0,2],hex:0x0000ff,power:7},
 {at:[5,0,3],hex:0xffff00,power:10},
 {at:[9,0,1],hex:0xff00ff,power:8},
 {at:[2,0,3],hex:0x00ffff,power:3},
 {at:[200,0,3],hex:0xffffff,power:1}
];
for(const r of requests)assert.equal(pool.request(r.at,{color:r.hex,intensity:r.power,distance:20}),true);
const a=pool.resolve([0,0,2]);
assert.equal(a.count,6,"keep at most six most significant lights");
assert.equal(a.posRange.length,24);
assert.equal(a.colorIntensity.length,24);
assert.equal(a.posRange[0],2);
assert.equal(a.colorIntensity[0],1);
assert.equal(a.colorIntensity[1],0);
assert.ok(a.colorIntensity[2]>.1&&a.colorIntensity[2]<.14);
assert.equal(pool.resolve([0,0,2]).count,0,"each physics frame owns only fresh requests");
const nearPool=new NativePointLightPool({maxLights:2});
assert.ok(nearPool.request([1,2,3],{color:[.2,.3,.4],intensity:10,distance:25}));
assert.ok(nearPool.request([90,2,3],{color:0xff00ff,intensity:12,distance:25}));
assert.ok(nearPool.request([2,2,3],{color:0x00ffff,intensity:4,distance:25}));
const b=nearPool.resolve([0,0,0]);
assert.equal(b.count,2);
assert.deepEqual(Array.from(b.posRange.slice(0,3)),[1,2,3]);
assert.equal(b.posRange[4],2,"important near gameplay light wins against distant weak light");
assert.equal(nearPool.request([Infinity,0,0]),false);
assert.equal(nearPool.request([0,0,0],{intensity:0}),false);
assert.throws(()=>nearPool.request([0,0,0],{color:0x1000000}),/RGB/);
assert.throws(()=>nearPool.resolve([0,NaN,0]),/camera/);
assert.throws(()=>new NativePointLightPool({maxLights:7}),/budget/);
const renderer=Object.create(NativeSceneRenderer.prototype);
renderer.disposed=false;
renderer.setPointLights(b);
assert.equal(renderer.pointLights.count,2);
assert.notEqual(renderer.pointLights.posRange,b.posRange,"renderer must own its own immutable snapshot");
const saved=renderer.pointLights.posRange[0];
b.posRange[0]=5678;
assert.equal(renderer.pointLights.posRange[0],saved);
assert.throws(()=>renderer.setPointLights({count:99,posRange:new Float32Array(24),colorIntensity:new Float32Array(24)}),/invalid/);
const world=Object.create(NativeWorldPresenter.prototype);
world.lights=pool;world.disposed=false;
assert.equal(world.requestLight([0,0,2],{color:0xffffff,intensity:5}),true);
assert.equal(pool.resolve([0,0,0]).count,1);
world.disposed=true;
assert.throws(()=>world.requestLight([0,0,0]),/disposed/);
console.log("native point lights: Three-free real game requests, 6-light GPU budget, deterministic priority, reused buffers and frame reset");
