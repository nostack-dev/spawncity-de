import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const jet=read("sim/jet_mode.mjs"),world=read("sim/real_world_bootstrap.mjs");
const shots=read("sim/headshot_feedback.mjs"),audio=read("sim/combat_audio_bank.mjs");
const actor=read("sim/character_model.mjs"),weapons=read("sim/gameplay_final_runtime_v2.mjs"),fire=read("sim/flight_fire_fx.mjs");

// The minimap is top-right. EJECT must occupy the OPPOSITE top corner,
// while keeping the same touch hold semantics and mouse/keyboard exit.
assert.match(world,/#worldLookHud\{[^}]*right:max\(10px/);
const eject=jet.match(/#jetHud \[data-a=exit\]\{([^}]+)\}/)?.[1]||"";
assert.match(eject,/left:max\(8px/);
assert.match(eject,/right:auto/);
assert.ok(!eject.includes("right:max("),"EJECT must not cover minimap");
assert.match(jet,/held>=650&&active&&jet\)exit\(\)/);
assert.match(jet,/e\.detail===0\|\|document\.body\.classList\.contains\('desktop-input'\)/);

// Headshot damage/hit zone/event APIs are preserved, but no label or announcer
// can be constructed, fetched, decoded or played on the normal hit path.
assert.match(shots,/export function headZone\(hit\)/);
assert.match(shots,/export function announceHeadshot/);
assert.match(shots,/playCombatAudio\(ctx,"crack"/);
assert.match(audio,/function renderCrack\(/);
assert.ok(!shots.includes("headshotPop"),"no pop/label in DOM");
assert.ok(!shots.includes("headshot_announcer.mp3"),"no voice resource");
assert.ok(!shots.includes("speechSynthesis")&&!shots.includes("decodeAudioData"));
assert.match(shots,/return\{shown:false,voice:false,sound\}/);
assert.match(shots,/headshotVoice="0"/);

// This pose is only for running civilians and joggers, not players/zombies.
// Upper torso falls back (+x), thighs reach out in +Y, head counter-rotates.
assert.match(actor,/NPC_RUN_RECLINE_RAD=\.60,NPC_RUN_FEET_FORWARD_RAD=\.20/);
assert.match(actor,/rig\.outfit==="civilian"\|\|rig\.outfit==="runner"/);
assert.match(actor,/G\.hipL\+reach/);
assert.match(actor,/exaggeratedNpcRun\?NPC_RUN_RECLINE_RAD/);
assert.match(actor,/exaggeratedNpcRun\?-.28/);

// Three drone modes, single target-tracking guided shot, standard salvo retained,
// steering with path collisions, and PvP splash capped / cooldown.
assert.match(weapons,/droneWeapon==="missile"\?"guided":"gun"/);
assert.match(weapons,/const guided=droneWeapon==="guided"/);
assert.match(weapons,/if\(!guided\)for\(let k=1;k<ROCKET_SALVO/);
assert.match(weapons,/object:hit\?\.object\|\|null/);
assert.match(weapons,/m\.object\.getWorldPosition\?\.\(m\.target\)/);
assert.match(weapons,/playerDamageCap:m\.guided\?28:18/);
assert.match(weapons,/performance\.now\(\)-last<650/);
assert.match(weapons,/id="droneGuidedLock"/);
assert.match(weapons,/reticle\.textContent=hasActor\?"◈ ZIEL":"◇ LENK"/);
assert.match(fire,/mode==="missile"\|\|mode==="guided"/);
console.log("Gameplay regression passed: EJECT/minimap disjoint, headshot click only, NPC backward sprint and guided drone PvP cap.");
