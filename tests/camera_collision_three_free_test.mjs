import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("sim/camera_collision_guard.mjs","utf8");
assert.doesNotMatch(source,/(?:import\s+\*\s+as\s+THREE|from\s+["']three["']|\bTHREE\.)/);
const old={document:globalThis.document,setTimeout:globalThis.setTimeout,
 clearTimeout:globalThis.clearTimeout,world:globalThis.__arondightRealWorld,
 walk:globalThis.__arondightWalkMode,drive:globalThis.__arondightVehicleDrive,
 jet:globalThis.__jetMode};
try{
 let captured=null;
 const view={dataset:{}};
 globalThis.document={getElementById:id=>id==="viewport"?view:null};
 globalThis.setTimeout=()=>0;
 globalThis.clearTimeout=()=>{};
 const bridge={
  presentationCameraProvider:{isActive:()=>true,apply:()=>123},
  attachPresentationCameraProvider(p){this.presentationCameraProvider=p;},
  constrainCameraToPhysics(a,camera){
   captured=a;assert.equal(typeof a.set,"function");
   assert.deepEqual([a.x,a.y],[4,5]);
   assert.ok(Number.isFinite(a.z));
   camera.position.z=0;
   return true;
  }
 };
 globalThis.__arondightRealWorld=bridge;
 globalThis.__arondightWalkMode={mode:"foot",position:{x:4,y:5,z:2.5}};
 globalThis.__arondightVehicleDrive={active:false};
 globalThis.__jetMode={active:false};
 await import("../sim/camera_collision_guard.mjs");
 const camera={position:{x:4,y:5,z:2.5},near:.01,updateProjectionMatrix(){this.projectionUpdated=true;},updateMatrixWorld(){this.worldUpdated=true;}};
 const outcome=bridge.presentationCameraProvider.apply({camera});
 assert.equal(outcome,123);
 assert.equal(captured.x,4);assert.equal(captured.y,5);
 assert.ok(camera.position.z>0,"camera collision terrain floor was not enforced");
 assert.ok(camera.near>=.045);
 assert.equal(camera.projectionUpdated,true);
 assert.equal(camera.worldUpdated,true);
 assert.equal(view.dataset.playerCameraCollision,"blocked");
 assert.equal(view.dataset.playerCameraCollisionGuard,"box3d-ray+terrain-relative-floor-v4");
 console.log("Production camera collision: Box3D anchor works without importing Three; collision floor/camera updates preserved.");
}finally{
 globalThis.document=old.document;globalThis.setTimeout=old.setTimeout;globalThis.clearTimeout=old.clearTimeout;
 globalThis.__arondightRealWorld=old.world;globalThis.__arondightWalkMode=old.walk;
 globalThis.__arondightVehicleDrive=old.drive;globalThis.__jetMode=old.jet;
}
