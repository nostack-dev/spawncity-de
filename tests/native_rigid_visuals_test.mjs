import assert from "node:assert/strict";
import {NativeRigidVisuals,box3dVisualCategory} from "../sim/native_rigid_visuals.mjs";
const calls=[],active=new Map(),poses=new Map();
const car={id:"taxi1",kind:"vehicle",halfExtents:[2,.85,.62]};
const bus={id:"bus4",kind:"bus",halfExtents:[5,1.3,1.4]};
const jet={id:"jet17",kind:"aircraft",halfExtents:[4,6,.95]};
const drone={id:"drone9",kind:"police-drone",drone:true,halfExtents:[.3,.3,.11]};
const bodies=[car,bus,jet,drone];
const makePose=(x)=>({position:[x,0,3],rotation:[0,0,0,1],wheels:null});
for(const [i,b]of bodies.entries())poses.set(b.id,makePose(i*10));
poses.get("taxi1").wheels=[
 {position:[-1.4,-.8,2.6],rotation:[0,0,0,1],radius:.35},
 {position:[-1.4,.8,2.6],rotation:[0,0,0,1],radius:.35},
 {position:[1.4,-.8,2.6],rotation:[0,0,0,1],radius:.35},
 {position:[1.4,.8,2.6],rotation:[0,0,0,1],radius:.35}
];
const physics={bodies:()=>bodies,renderPose:id=>poses.get(id)||null};
const renderer={
 upsert(id,mesh){
  assert.ok(mesh.positions instanceof Float32Array);
  assert.ok(mesh.instances.transforms instanceof Float32Array);
  calls.push(["upsert",id,mesh.instances.transforms.length/16]);
  active.set(id,mesh.instances);
 },
 updateInstances(id,instances){calls.push(["update",id,instances.transforms.length/16]);assert.ok(active.has(id));active.set(id,instances);},
 remove(id){calls.push(["remove",id]);active.delete(id);}
};
const visuals=new NativeRigidVisuals(renderer,physics);
const first=visuals.update();
assert.equal(first.bodies,4);
assert.equal(first.wheels,4);
assert.equal(first.groups,5);
assert.equal(active.size,5);
assert.equal(calls.filter(x=>x[0]==="upsert").length,5);
assert.equal(box3dVisualCategory(jet),"jet");
assert.equal(box3dVisualCategory(drone),"drone");
const second=visuals.update();
assert.equal(second.groups,5);
assert.equal(calls.filter(x=>x[0]==="upsert").length,5,"unchanged mesh geometries must never reallocate");
assert.equal(calls.filter(x=>x[0]==="update").length,5);
const carTransform=active.get("box3d/car").transforms;
assert.equal(carTransform[0],4);assert.ok(Math.abs(carTransform[5]-1.7)<1e-5);
assert.ok(Math.abs(carTransform[10]-1.24)<1e-5);
poses.get("taxi1").position[0]=17;
visuals.update();
assert.equal(active.get("box3d/car").transforms[12],17,"visual must always use authoritative current Box3D pose");
bodies.splice(bodies.indexOf(drone),1);
poses.delete(drone.id);
visuals.update();
assert.equal(active.has("box3d/drone"),false);
assert.ok(calls.some(x=>x[0]==="remove"&&x[1]==="box3d/drone"));
const before=active.size;
visuals.dispose();
assert.equal(active.size,0);
assert.throws(()=>visuals.update(),/disposed/);
assert.ok(before>0);
assert.throws(()=>new NativeRigidVisuals({},physics),/native renderer/);
console.log("Native exclusive Box3D visual adapter: exact pose interpolation source, instancing, 4 wheel joints, stable buffers, eviction, camera-independent drawing passed.");
