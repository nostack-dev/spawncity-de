import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nativeDefaultFlightParams,createNativeFlightPhysics} from "../sim/native_flight_physics.mjs";
const old=readFileSync("sim/simulator.mjs","utf8");
const pure=readFileSync("sim/native_flight_physics.mjs","utf8");
assert.doesNotMatch(pure,/import\s+[^;\n]*["']three["']|\bTHREE\./,
 "real 1 kHz flight model must not allocate any Three.js scene graph");
assert.doesNotMatch(pure,/new\s+WebGLRenderer|new\s+THREE\./);
const unchanged=["rebuildTerrain","reseatOnTerrain","rescueFromTerrain","setWorldBuildingCollisions",
 "resolveWorldBuildingLaunch","rebuildWorldBuildingCollisions","localVector","worldVector",
 "worldPoint","linear","angular","position","rotation","syncPresentationSnapshots",
 "capturePresentationStep","capturePresentationCurrent","groundRange","resolveCameraPath",
 "imuRaw","batteryOcv","applyForces","parkedCheck","step","state"];
for(const name of unchanged){
 const start=pure.indexOf("\n  "+name+"("),legacyStart=old.indexOf("\n  "+name+"(",old.indexOf("class PhysicsModel {"));
 assert.ok(start>0&&legacyStart>0,"missing original physics method "+name);
 const from=pure.slice(start);
 // Exact verified dynamic equations, motor model, collision filters and IMU.
 // Bound method after matching braces, so inter-method comments don't count.
 function methodBlock(s){
  const p=s.indexOf("{");let depth=0;
  for(let i=p;i<s.length;i++){
   if(s[i]==="{")depth++;else if(s[i]==="}"&&--depth===0)return s.slice(0,i+1);
  }
  throw Error("unterminated "+name);
 }
 const next=methodBlock(from),prev=methodBlock(old.slice(legacyStart));
 assert.equal(next,prev,"Original Box3D flight physics changed in "+name);
}
const p=nativeDefaultFlightParams();
assert.ok(p.mass>.4&&p.mass<1.1);
assert.equal(p.span,.225);assert.equal(p.propD,.127);
assert.equal(p.wind.length,3);
assert.ok(p.staticAuthority?.totalThrustN>0);
assert.throws(()=>createNativeFlightPhysics(null,p),/Box3D WASM/);
console.log("Original 1 kHz Box3D force, rotor, wind, battery, IMU and collision methods preserved exactly without Three (24 methods).");
