import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(".github/workflows/box3d-upstream-wasm.yml","utf8");
const preview=workflow.split(/^  native-preview-publish:\s*$/m)[1];
assert.ok(preview,"same-repo native candidate must have a real publish path");
assert.match(workflow,/^  push:\s*\n\s+branches:\s*\[main\]/m,"native test game should build from current main");
assert.match(preview,/needs:\s*native-browser-smoke/,"never publish native candidate before real browser boots");
assert.match(preview,/github\.event_name\s*==\s*'push'/);
assert.match(preview,/github\.ref\s*==\s*'refs\/heads\/main'/);
assert.match(preview,/contents:\s*write/);
assert.match(preview,/git fetch origin gh-pages/);
assert.match(preview,/git checkout -B gh-pages origin\/gh-pages/);
assert.match(preview,/cp .*native_game\.html native\/index\.html/);
assert.match(preview,/native\/build\.json/);
assert.match(preview,/nativeReleaseVerified:false/,"preview must not falsely assert production hardware acceptance");
assert.match(preview,/hardwareAcceptance:"pending"/);
assert.match(preview,/git add -- native\/index\.html native\/build\.json/);
assert.match(preview,/git push origin HEAD:gh-pages/);
assert.doesNotMatch(preview,/git push --force|git push -f\b/,"never delete existing production pages");
assert.doesNotMatch(preview,/git add -A|git add \./,"preview must stage only its two own paths");
assert.ok(!preview.includes("renderer_acceptance_gate.mjs --gate"),
 "preview is a separate device test, not a fake bypass of production gate");
const prod=readFileSync(".github/workflows/deploy.yml","utf8");
assert.match(prod,/node tests\/renderer_acceptance_gate\.mjs --gate/,
 "actual production still requires all 15 real-device acceptance scenarios");
console.log("Native preview publishes only isolated /native/ after Chromium, retains original live game and full production hardware gate.");
