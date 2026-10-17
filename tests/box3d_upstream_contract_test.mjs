import assert from "node:assert/strict";
import {readFileSync,existsSync,statSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const script=readFileSync("tools/build_box3d_upstream_wasm.sh","utf8");
const workflow=readFileSync(".github/workflows/box3d-upstream-wasm.yml","utf8");
const version="efca0c184d40fd6a82016983f1601c4d23965867";
assert.ok(script.includes(version),"exact latest 2026-10-16 Erin Catto Box3D SHA must be pinned");
assert.match(script,/git -C "\$WORK\/wrapper\/vendor\/box3d" checkout -q --detach "\$BOX3D_SOURCE_SHA"/);
assert.match(script,/test "\$\(git -C "\$WORK\/wrapper\/vendor\/box3d" rev-parse HEAD\)" = "\$BOX3D_SOURCE_SHA"/);
assert.match(workflow,/emscripten\/emsdk:6\.0\.2/);
assert.match(workflow,/contents: read/);
assert.doesNotMatch(workflow,/(?:contents|pages): write/);
assert.match(script,/node test\/smoke\.mjs/);
assert.ok(!workflow.includes("npm publish")&&!workflow.includes("git push"),"never publish unapproved physics update");
const dir=process.argv[2];
if(dir){
 const manifest=JSON.parse(readFileSync(dir+"/provenance.json","utf8"));
 assert.equal(manifest.upstreamSha,version);
 assert.equal(manifest.bindingSha,"5d5a3af049cccd9948b2b55bac4342414af0ef64");
 for(const name of["box3d.inline.mjs","box3d.wasm","box3d.mjs","box3d.d.ts","box3d.mt.inline.mjs","box3d.mt.wasm","box3d.mt.mjs","SHA256SUMS.txt"])
  assert.ok(existsSync(dir+"/"+name)&&statSync(dir+"/"+name).size>0,"compiled source missing "+name);
 const {default:factory}=await import(pathToFileURL(resolve(dir,"box3d.inline.mjs")).href);
 const b3=await factory();
 for(const name of["b3DefaultWorldDef","b3CreateWorld","b3DefaultBodyDef","b3CreateBody","b3DefaultShapeDef","b3CreateBoxShape","b3World_Step","b3World_CastRayClosest","b3World_CastMover","b3DestroyWorld"])
  assert.equal(typeof b3[name],"function","latest source broke current SpawnCity JS physics API "+name);
 const wd=b3.b3DefaultWorldDef();wd.gravity=[0,0,-9.81];wd.enableSleep=false;
 const world=b3.b3CreateWorld(wd);
 const ground=b3.b3DefaultBodyDef();ground.position=[0,0,-.5];
 const g=b3.b3CreateBody(world,ground);b3.b3CreateBoxShape(g,b3.b3DefaultShapeDef(),20,20,.5);
 const bd=b3.b3DefaultBodyDef();bd.type=b3.b3BodyType.b3_dynamicBody;bd.position=[0,0,3];
 const body=b3.b3CreateBody(world,bd);b3.b3CreateBoxShape(body,b3.b3DefaultShapeDef(),.5,.5,.5);
 const positionOut=new Float32Array(3);
 const zBefore=b3.b3Body_GetPosition(positionOut,body)[2];
 for(let i=0;i<120;i++)b3.b3World_Step(world,1/60,4);
 const zAfter=b3.b3Body_GetPosition(positionOut,body)[2];
 assert.ok(zAfter<zBefore-1&&zAfter>-.1&&zAfter<1.1,"upstream gravity/solver differ unexpectedly: "+zAfter);
 b3.b3DestroyWorld(world);
 console.log("LATEST_BOX3D_WASM_VERIFIED "+JSON.stringify({engine:version,zBefore,zAfter,manifest}));
}else console.log("Box3D upstream source pin and isolated WASM-build contract OK.");
