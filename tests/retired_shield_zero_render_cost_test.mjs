import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const code=readFileSync("sim/player_shield.mjs","utf8");
assert.doesNotMatch(code,/from ["']three(?:["'/])/,"retired shield must never bundle Three.js");
assert.doesNotMatch(code,/requestAnimationFrame|new .*Geometry|threeScene|LineSegments|MeshBasicMaterial/,"disabled shield must allocate no GPU scene or perpetual idle frames");
const prevDocument=globalThis.document,prevRAF=globalThis.requestAnimationFrame,prevGlobal=globalThis.__arondightPlayerShield;
let frames=0;
const viewport={dataset:{}};
globalThis.document={getElementById:id=>id==="viewport"?viewport:null};
globalThis.requestAnimationFrame=()=>{frames++;throw Error("retired shield must not start RAF");};
try{
  const shield=await import("../sim/player_shield.mjs");
  assert.equal(shield.PLAYER_SHIELD_VERSION,"pilot-nuke-shield-v1");
  assert.equal(shield.playerShield.active,false);
  assert.equal(shield.playerShield.nukeImmune(),false);
  assert.equal(globalThis.__arondightPlayerShield,shield.playerShield,"legacy global contract must remain");
  assert.equal(viewport.dataset.playerShield,shield.PLAYER_SHIELD_VERSION);
  shield.installPlayerShield();shield.installPlayerShield();
  assert.equal(frames,0);
}finally{
  if(prevDocument===undefined)delete globalThis.document;else globalThis.document=prevDocument;
  if(prevRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=prevRAF;
  if(prevGlobal===undefined)delete globalThis.__arondightPlayerShield;else globalThis.__arondightPlayerShield=prevGlobal;
}
console.log("Retired shield: no Three, no hidden GPU mesh, no endless RAF, nuke immunity stays false.");
