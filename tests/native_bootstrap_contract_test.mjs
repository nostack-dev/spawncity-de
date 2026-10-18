import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("native_game.html","utf8");
const boot=readFileSync("sim/native_game_bootstrap.mjs","utf8");
assert.match(html,/<meta name="viewport"/);
assert.match(html,/<div id="viewport"/);
assert.match(html,/<button id="gameMenuStart"/);
assert.match(html,/src="\.\/sim\/native_game_bootstrap\.mjs"/);
assert.match(html,/data-mode="drone"/);
for(const mode of ["foot","car","jet"])assert.ok(html.includes('data-mode="'+mode+'"'));
assert.match(boot,/import Box3DFactory from "box3d\.js\/dist\/box3d\.inline\.mjs"/);
assert.match(boot,/import FlightCoreFactory from "\.\.\/generated\/flight_core\.mjs"/);
assert.match(boot,/new NativeGameRuntime\(/);
assert.match(boot,/new NativeGameInput\(/);
assert.match(boot,/game\.beforeFrame=/);
assert.match(boot,/fetchNativeOsm\(/);
assert.doesNotMatch(boot,/\bTHREE\.|from ["']three["']|<script[^>]+src=["']https?:\/\//i);
assert.doesNotMatch(html,/(?:real_world_bootstrap|auto_flight_start|three\.module\.js|<script[^>]+src=["']https?:\/\/)/i,
 "native exclusive game must not secretly load the old presentation");
const built=process.argv[2];
if(built){
 const candidate=readFileSync(built,"utf8");
 assert.ok(candidate.length>350000,"real Box3D and Flight Core must be in the actual built HTML");
 assert.doesNotMatch(candidate,/src=["']\.\/sim\/native_game_bootstrap\.mjs/,"must embed compiled pinned WASM, not request missing source");
 assert.ok(candidate.includes('id="gameMenuStart"'));
 assert.ok(candidate.includes("SPAWNCITY_NATIVE_CANDIDATE_SHA:"));
 assert.ok(candidate.includes("native-webgl2-only"),"browser package must contain the actual native presenter, not only menu markup");
 assert.doesNotMatch(candidate,/THREE\.WebGLRenderer|three\.module\.js|@vite|unpkg|cdnjs/i);
}
console.log("single native browser entry: genuine pinned Box3D, Flight Core, WebGL2, OSM, input, no legacy fallback");
