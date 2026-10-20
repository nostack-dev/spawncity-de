import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const htmlPath=process.argv[2],metaPath=process.argv[3];
if(!htmlPath||!metaPath)throw Error("usage: node tests/production_box3d_bundle_contract_test.mjs <game.html|--input-only> <esbuild-meta.json>");
const html=htmlPath==="--input-only"?null:readFileSync(htmlPath,"utf8");
const meta=JSON.parse(readFileSync(metaPath,"utf8"));
const provenance=JSON.parse(readFileSync("artifacts/box3d-upstream-wasm/provenance.json","utf8"));
const desired="efca0c184d40fd6a82016983f1601c4d23965867";
assert.equal(provenance.upstreamSha,desired);
if(html!==null){assert.ok(html.includes("SPAWNCITY_BOX3D_SOURCE_SHA:"+desired),"published game must identify exact new native engine SHA");assert.ok(html.length>100_000,"HTML game should be a complete inlined bundle");}
const keys=Object.keys(meta.inputs||{});
const input=keys.find(x=>x.replaceAll("\\","/").endsWith("artifacts/box3d-upstream-wasm/box3d.inline.mjs"));
assert.ok(input,"bundler did not consume fresh compiled Box3D; inspected: "+keys.filter(x=>x.includes("box3d")).join(", "));
assert.ok((meta.inputs[input]?.bytes||0)>900_000,"fresh inline WASM suspiciously small");
const oldInputs=keys.filter(x=>/node_modules\/box3d\.js\/(dist\/)?box3d(\.inline)?\.mjs$/.test(x));
const importers=oldInputs.flatMap(x=>keys.filter(key=>(meta.inputs[key]?.imports||[]).some(y=>y.path===x||y.path.replaceAll("\\","/").endsWith("box3d.js/dist/box3d.inline.mjs"))));
assert.deepEqual(oldInputs,[],"old npm Box3D was silently bundled; imported by: "+importers.join(", ")+"; all Box3D inputs: "+keys.filter(x=>x.toLowerCase().includes("box3d")).join(", "));
assert.ok(meta.outputs&&Object.values(meta.outputs).some(x=>(x.inputs||{})[input]),"fresh engine input not linked into final game output");
console.log("SpawnCity production Box3D provenance passed:",desired,"source bytes",meta.inputs[input].bytes);
