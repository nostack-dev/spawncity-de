import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Selective rollback of kurzlernen-de@d7c298c1 (fullscreen) and
// kurzlernen-de@d915c27d (procedural enlarged first-person arms).
// Do not revert gameplay, targeting, touch, or any multiplayer code.
const file=path=>readFileSync(path,"utf8");
const manifest=JSON.parse(file("drone_simulator.webmanifest"));
const sim=file("sim/simulator.mjs");
const weapons=file("sim/first_person_weapon_runtime_v3.mjs");
const models=file("sim/weapon_models.mjs");

assert.equal(manifest.display,"fullscreen","The installable app must use its previous fullscreen mode");
assert.equal(manifest.orientation,"landscape");
assert.match(sim,/enterSolo\(\)/);
assert.match(sim,/requestFullscreen\(\{navigationUI:"hide"\}\)/);
assert.doesNotMatch(sim,/const installed=.*display-mode: standalone/);
assert.match(sim,/document\.exitFullscreen\(\)/);
assert.match(sim,/fullscreenchange/);
assert.match(sim,/syncSoloPresentationOrientation\(\)/);
assert.match(sim,/dataset\.soloOrientation/);
assert.match(sim,/screen\.orientation\?\.lock\?\.\("landscape"\)/);

// Classic weapon rig: the old walk-mode glove/sleeve meshes remain visible.
// Reposition weapon groups to pre-tactical-arm values without changing weapons.
assert.doesNotMatch(weapons,/attachWeaponArms\(/);
assert.doesNotMatch(weapons,/LEGACY_ARM_PARTS/);
assert.match(weapons,/gun\.traverse\?\.\(node=>\{if\(PISTOL_PARTS\.has\(node\.name\)\)node\.visible=false/);
for(const pose of [
  "new THREE.Vector3(.012,-.008,.015)",
  "new THREE.Vector3(.01,-.015,.018)",
  "new THREE.Vector3(.01,-.01,.02)",
  "new THREE.Vector3(.012,-.01,.02)",
  "group.position.set(.01,-.01,0)"
]) assert.ok(weapons.includes(pose),`Classic weapon pose missing: ${pose}`);

assert.match(models,/Bare-knuckle boxer's hands as seen from the eyes/);
assert.match(models,/hand\.add\(capsule\(\.038,\.03,skin/);
assert.match(models,/g\.position\.set\(-\.05,-\.03,-\.02\)/);
assert.match(models,/const arm=old\|\|new THREE\.Group\(\)/);
assert.match(models,/WALK_KNIFE_GRIP_POSE/);
assert.match(models,/WALK_KNIFE_TRAIL/);
assert.match(models,/WALK_ROCKET_MUZZLE_NODE/);
assert.match(models,/WALK_SNIPER_MUZZLE_NODE/);

console.log("Fullscreen and classic FPS hands regression contracts passed.");
