#!/usr/bin/env node
// Prints the live public origin from sim/site_config.mjs.
// PUBLIC_SITE_ORIGIN overrides it for a rehearsal (no trailing slash).
//   node tools/public_site.mjs origin
//   node tools/public_site.mjs game
//   node tools/public_site.mjs controller
//   node tools/public_site.mjs build-json <sha>

import {SITE,pagesOrigin,gameUrl,controllerUrl} from "../sim/site_config.mjs";
import {existsSync,readFileSync} from "node:fs";
import {auditRuntime,verifyRendererEvidence} from "../tests/renderer_acceptance_gate.mjs";

const override=String(process.env.PUBLIC_SITE_ORIGIN||"").replace(/\/$/,"");
const origin=override||pagesOrigin();
const cmd=process.argv[2]||"origin";

if(cmd==="origin")console.log(origin);
else if(cmd==="game")console.log(override?`${origin}${SITE.gamePath}`:gameUrl());
else if(cmd==="controller")console.log(override?`${origin}${SITE.controllerPath}`:controllerUrl());
else if(cmd==="build-json"){
  const sha=String(process.argv[3]||"");
  if(!/^[0-9a-f]{7,40}$/.test(sha)){console.error("build-json needs a hex sha");process.exit(2);}
  // This is the provenance of the renderer ACTUALLY bundled in production,
  // not the presence of experimental native files committed alongside it.
  // A native release can never be claimed without the all-or-nothing source
  // audit and all 15 real-device proof scenarios passing.
  const audit=auditRuntime();
  let verifiedNative=false;
  if(audit.nativeOnly){
    const evidencePath=process.env.NATIVE_RENDERER_EVIDENCE||"artifacts/renderer-acceptance.json";
    const evidence=existsSync(evidencePath)?JSON.parse(readFileSync(evidencePath,"utf8")):null;
    verifiedNative=verifyRendererEvidence(evidence).pass;
    if(!verifiedNative){
      console.error("Native-only source needs full real-device acceptance before publishing");
      process.exit(1);
    }
  }
  const renderer=verifiedNative?"native-webgl2":"threejs";
  process.stdout.write(`${JSON.stringify({
    sha,product:SITE.productName,productHost:SITE.productHost,pagesHost:SITE.pagesHost,
    renderer,nativeReleaseVerified:verifiedNative,threeImportModules:audit.threeImportCount
  })}\n`);
}else{console.error(`unknown command ${cmd}`);process.exit(2);}
