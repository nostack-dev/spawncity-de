import assert from "node:assert/strict";
import {readFileSync,existsSync,statSync} from "node:fs";

const ownedSources=[
  "drone_simulator.html",
  "drone_controller.html",
  "drone_simulator.webmanifest",
  "oppenheimer-sw.js",
  "sim/real_world_bootstrap.mjs",
  "sim/simulator.mjs",
  "sim/lan_vs.mjs",
  "sim/changelog_menu.mjs",
  "sim/first_person_controller_v5.mjs",
  "sim/foot_look_capture.mjs",
  "sim/controller.mjs",
  "sim/audio/headshot_announcer.mp3",
  "sim/icons/spawncity-512.png",
  "esp32/Arondight45_DroneFC_Core.hpp",
  "tests/sil_wasm_smoke.mjs"
];
for(const path of ownedSources){
  assert.ok(existsSync(path)&&statSync(path).size>0,`Missing tracked game source: ${path}`);
}
const workflow=readFileSync(".github/workflows/deploy.yml","utf8");
assert.doesNotMatch(workflow,/git\s+(?:-C\s+\S+\s+)?(?:fetch|clone).*kurzlernen-de/i,"SpawnCity must not depend on kurzlernen-de at deploy time");
assert.doesNotMatch(workflow,/Import the game tree/,"Remove legacy game import step");
assert.match(workflow,/sim\/real_world_bootstrap\.mjs/);
const changelog=readFileSync("sim/changelog_menu.mjs","utf8");
const markers=[...changelog.matchAll(/\{date:"(20\d\d-\d\d-\d\d)",time:"(\d\d:\d\d)",title:/g)];
assert.ok(markers.length>=3,"Changelog should contain game release history");
for(let i=1;i<markers.length;i++){
  assert.ok(markers[i-1][1]+markers[i-1][2] >= markers[i][1]+markers[i][2],
    `Changelog out of order: ${markers[i-1][0]} before ${markers[i][0]}`);
}
assert.match(changelog,/Neuer Mehrspieler-Raum/);
assert.match(changelog,/Headshots, Sniper-Fixes/);
console.log(`SpawnCity owns game sources; ${markers.length} changelog entries in newest-first order.`);
