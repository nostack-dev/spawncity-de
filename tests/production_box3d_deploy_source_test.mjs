import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const deploy=readFileSync(".github/workflows/deploy.yml","utf8");
const upstream=readFileSync("tools/build_box3d_upstream_wasm.sh","utf8");
for(const requirement of [
"emscripten/emsdk:6.0.2",
"bash tools/build_box3d_upstream_wasm.sh",
"tests/box3d_upstream_contract_test.mjs",
"artifacts/box3d-upstream-wasm/box3d.inline.mjs",
"--metafile=/tmp/spawncity-simulator.meta.json",
"production_box3d_bundle_contract_test.mjs",
"SPAWNCITY_BOX3D_SOURCE_SHA:",
"sha256sum -c SHA256SUMS.txt",
]){
 assert.ok(deploy.includes(requirement),"Production build missing "+requirement);
}
const alias=deploy.match(/--alias:box3d\.js\/dist\/box3d\.inline\.mjs=([^ ]+)/);
assert.ok(alias&&alias[1].includes("box3d-upstream-wasm/box3d.inline.mjs"),
  "Bundler must use the newly compiled Box3D as the actual executable inline source");
assert.ok(!deploy.includes("--alias:box3d.js/dist/box3d.inline.mjs=box3d.js/inline"),
  "Unchanged npm Box3D fallback is not acceptable");
assert.ok(deploy.indexOf("Compile and validate exact Erin Catto Box3D for production") <
 deploy.indexOf("Bundle self-contained Pages"),"Compile needs to finish before bundling");
assert.match(upstream,/efca0c184d40fd6a82016983f1601c4d23965867/);
assert.match(upstream,/test "\$\(git -C "\$WORK\/wrapper\/vendor\/box3d" rev-parse HEAD\)" = "\$BOX3D_SOURCE_SHA"/);
console.log("Exact-upstream live Box3D deployment source contract passed.");
