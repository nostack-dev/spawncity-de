#!/usr/bin/env node
// Prints the live public origin from sim/site_config.mjs.
// PUBLIC_SITE_ORIGIN overrides it for a rehearsal (no trailing slash).
//   node tools/public_site.mjs origin
//   node tools/public_site.mjs game
//   node tools/public_site.mjs controller
//   node tools/public_site.mjs build-json <sha>

import {SITE,pagesOrigin,gameUrl,controllerUrl} from "../sim/site_config.mjs";

const override=String(process.env.PUBLIC_SITE_ORIGIN||"").replace(/\/$/,"");
const origin=override||pagesOrigin();
const cmd=process.argv[2]||"origin";

if(cmd==="origin")console.log(origin);
else if(cmd==="game")console.log(override?`${origin}${SITE.gamePath}`:gameUrl());
else if(cmd==="controller")console.log(override?`${origin}${SITE.controllerPath}`:controllerUrl());
else if(cmd==="build-json"){
  const sha=String(process.argv[3]||"");
  if(!/^[0-9a-f]{7,40}$/.test(sha)){console.error("build-json needs a hex sha");process.exit(2);}
  process.stdout.write(`${JSON.stringify({sha,product:SITE.productName,productHost:SITE.productHost,pagesHost:SITE.pagesHost})}\n`);
}else{console.error(`unknown command ${cmd}`);process.exit(2);}
