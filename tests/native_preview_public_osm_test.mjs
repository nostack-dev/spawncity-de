// Verify an ACTUALLY DEPLOYED native preview: real HTTPS app origin,
// real OpenStreetMap buildings, and collision hulls in the same Box3D world.
// No mocked OSM response and no synthetic city count. Separate from the
// opaque-origin offline renderer smoke, which only tests GPU/physics fallback.
import puppeteer from "puppeteer-core";
import {PNG} from "pngjs";
import {mkdirSync,writeFileSync} from "node:fs";
const address=process.argv[2];
if(!address?.startsWith("https://")||!process.env.CHROME_BIN)
 throw Error("Usage: CHROME_BIN=/usr/bin/chromium node tests/native_preview_public_osm_test.mjs https://spawncity.de/native/");
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist",
  "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

// Measure ONLY the central WebGL viewport, excluding the HUD/menu controls.
// A nonzero GPU draw count or Box3D collider count alone does not prove that
// the native camera sees any geometry (especially car/jet modes).
function centralWorldPixels(buffer){
 const png=PNG.sync.read(buffer),counts=new Map(),min=[255,255,255],max=[0,0,0];
 let n=0;
 for(let y=Math.round(png.height*.23);y<Math.round(png.height*.72);y+=7){
  for(let x=Math.round(png.width*.16);x<Math.round(png.width*.83);x+=7){
   const offset=(y*png.width+x)*4;
   const rgb=[png.data[offset],png.data[offset+1],png.data[offset+2]];
   const key=(rgb[0]<<16)|(rgb[1]<<8)|rgb[2];
   counts.set(key,(counts.get(key)||0)+1);n++;
   rgb.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
  }
 }
 return {uniqueColors:counts.size,pixelSamples:n,
  channelSpread:Math.max(...max.map((v,i)=>v-min[i])),
  diverseRatio:n?(1-Math.max(...counts.values())/n):0};
}
const hasWorldPixels=p=>p.pixelSamples>200&&p.uniqueColors>6
 &&p.channelSpread>=30&&p.diverseRatio>.015;

const diagnostics=[];
const visualDir="artifacts/native-public-visual";
mkdirSync(visualDir,{recursive:true});
const visualEvidence=[];
try{
 const page=await browser.newPage();
 page.on("pageerror",err=>diagnostics.push("pageerror: "+String(err).slice(0,220)));
 page.on("console",m=>{
  if(["error","warning"].includes(m.type()))diagnostics.push(m.type()+": "+m.text().slice(0,280));
 });
 await page.setViewport({width:1120,height:730,deviceScaleFactor:1});
 await page.goto(address+(address.includes("?")?"&":"?")+"e2e="+Date.now(),
  {waitUntil:"domcontentloaded",timeout:35000});
 await page.waitForSelector("#gameMenuStart:not([disabled])",{timeout:15000});
 const selected=await page.$eval("#worldSource",el=>el.value);
 if(selected!=="demo")throw Error("Native public preview did not default to explicit real OSM demo");
 await page.click("#gameMenuStart");
 await page.waitForFunction(()=>document.documentElement.dataset.engine==="native-webgl2",{timeout:55000});
 await page.waitForFunction(()=>{
  const msg=document.querySelector("#status")?.textContent||"";
  return msg.includes("real OSM buildings")||msg.includes("OSM connection failed");
 },{timeout:100000,polling:500});
 const data=await page.evaluate(()=>({
  status:document.querySelector("#status")?.textContent,
  engine:document.documentElement.dataset.engine,
  probe:window.__spawncityNativeProbe?.()??null
 }));
 console.log("NATIVE_PUBLIC_OSM "+JSON.stringify({status:data.status,
  cityStats:data.probe?.cityStats,colliders:data.probe?.buildingColliders,
  carSpawnClear:data.probe?.carSpawnClear,footSpawnClear:data.probe?.footSpawnClear,
  relocated:data.probe?.spawnClearance?.moved?.map(x=>x.id),
  roadSegments:data.probe?.roadSegments,diagnostics:diagnostics.slice(-8)}));
 if(!data.status?.includes("real OSM buildings"))
  throw Error("Public native world has no real OSM buildings: "+data.status+" "+diagnostics.slice(-6).join(" | "));
 if(!(data.probe?.buildingColliders>0)||!(data.probe?.cityStats?.built>0))
  throw Error("Public OSM visible/collision proof missing: "+JSON.stringify(data.probe));
 if(data.probe.carSpawnClear!==true||data.probe.footSpawnClear!==true)
  throw Error("Real OSM building intersects player's car/foot camera collider at spawn: "+
   JSON.stringify({car:data.probe.carSpawnClear,foot:data.probe.footSpawnClear,
     relocated:data.probe.spawnClearance?.moved}));

 // Real game-mode transitions: not only changing a pressed button.
 // Camera and GPU scene must remain valid, responsive and NONBLANK on the
 // actual public Pages origin containing 1,300 real OSM building meshes.
 const modes=[];
 for(const mode of ["drone","foot","car","jet"]){
  await page.click('[data-mode="'+mode+'"]');
  await page.waitForFunction(want=>document.querySelector('[data-mode="'+want+'"]')?.getAttribute("aria-pressed")==="true",
   {timeout:9000},mode);
  await new Promise(done=>setTimeout(done,420));
  const observed=await page.evaluate(()=>({
   renderer:document.querySelector("#viewport")?.dataset.renderer,
   telemetry:document.querySelector("#telemetry")?.textContent,
   probe:window.__spawncityNativeProbe?.()??null
  }));
  const pixels=centralWorldPixels(await page.screenshot({path:visualDir+"/"+mode+"-desktop.png"}));
  modes.push({mode,pixels,camera:observed.probe?.camera,
   meshCount:observed.probe?.meshCount,
   cityBuilt:observed.probe?.cityStats?.built,
   backlogMs:observed.probe?.backlogMs});
  if(observed.renderer!=="native-webgl2-only"||!observed.probe?.camera
   ||!(observed.probe.meshCount>50)||!(observed.probe.cityStats?.built>0)
   ||!hasWorldPixels(pixels))
   throw Error("Actual public native "+mode+" gameplay view blank or disconnected: "+
    JSON.stringify(modes.at(-1)));
  if(!(observed.probe.backlogMs<135))
   throw Error("Native "+mode+" physics latency unbounded: "+observed.probe.backlogMs);
  visualEvidence.push({device:"desktop",mode,pixels,meshCount:observed.probe.meshCount,
   cityBuilt:observed.probe.cityStats.built,backlogMs:observed.probe.backlogMs,
   screenshot:mode+"-desktop.png"});
 }
 // Release desktop WebGL resources before loading the same 1,300 OSM
 // buildings on software-rendered mobile Chromium.
 await page.close();
 // Visual acceptance requires a second *real mobile-sized browser boot*, not
 // a desktop screenshot resized after the fact. Viewport DPR and touch
 // capability are set before navigation; the real OSM HTTPS endpoint is used.
 const mobile=await browser.newPage();
 mobile.on("pageerror",err=>diagnostics.push("mobile pageerror: "+String(err).slice(0,220)));
 mobile.on("console",m=>{if(m.type()==="error")diagnostics.push("mobile console: "+m.text().slice(0,220));});
 await mobile.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mobile.goto(address+(address.includes("?")?"&":"?")+"visual_mobile="+Date.now(),
  {waitUntil:"domcontentloaded",timeout:35000});
 await mobile.waitForSelector("#gameMenuStart:not([disabled])",{timeout:15000});
 await mobile.click("#gameMenuStart");
 await mobile.waitForFunction(()=>document.documentElement.dataset.engine==="native-webgl2",{timeout:55000});
 await mobile.waitForFunction(()=>{
  const status=document.querySelector("#status")?.textContent||"";
  return status.includes("real OSM buildings")||status.includes("OSM connection failed");
 },{timeout:100000,polling:500});
 const mobileBoot=await mobile.evaluate(()=>{
  const canvas=document.querySelector("#nativeCanvas");
  const gl=canvas?.getContext("webgl2");
  const cr=canvas?.getBoundingClientRect();
  const toolbar=document.querySelector("#toolbar")?.getBoundingClientRect();
  return {canvasCount:document.querySelectorAll("canvas").length,
   canvasSize:[canvas?.width,canvas?.height],glError:gl?.getError(),
   cssSize:[cr?.width,cr?.height],viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,
   toolbar:toolbar&&{left:toolbar.left,right:toolbar.right,bottom:toolbar.bottom},
   touch:getComputedStyle(canvas).touchAction,
   scene:window.__spawncityNativeProbe?.()??null};
 });
 if(mobileBoot.canvasCount!==1||mobileBoot.glError!==0||mobileBoot.dpr!==2
  ||!(mobileBoot.canvasSize[0]>=780)||!(mobileBoot.canvasSize[1]>=1688)
  ||Math.abs(mobileBoot.cssSize[0]-mobileBoot.viewport[0])>2
  ||Math.abs(mobileBoot.cssSize[1]-mobileBoot.viewport[1])>2
  ||mobileBoot.touch!=="none"
  ||mobileBoot.toolbar.left<0||mobileBoot.toolbar.right>mobileBoot.viewport[0]+1
  ||mobileBoot.toolbar.bottom>mobileBoot.viewport[1]+1)
  throw Error("Actual mobile native canvas or toolbar clipped/DPR invalid: "+JSON.stringify(mobileBoot));
 for(const mode of ["drone","foot","car","jet"]){
  await mobile.click('[data-mode="'+mode+'"]');
  await mobile.waitForFunction(want=>document.querySelector('[data-mode="'+want+'"]')?.getAttribute("aria-pressed")==="true",
   {timeout:9000},mode);
  await new Promise(done=>setTimeout(done,500));
  const shot=mode+"-mobile.png";
  const pixels=centralWorldPixels(await mobile.screenshot({path:visualDir+"/"+shot}));
  const scene=await mobile.evaluate(()=>window.__spawncityNativeProbe?.()??null);
  const evidence={device:"mobile-390x844@2",mode,pixels,meshCount:scene?.meshCount,
   cityBuilt:scene?.cityStats?.built,backlogMs:scene?.backlogMs,screenshot:shot};
  visualEvidence.push(evidence);
  if(!scene?.camera||!(scene.meshCount>50)||!(scene.cityStats?.built>0)
   ||!hasWorldPixels(pixels)||!(scene.backlogMs<135))
   throw Error("Actual PUBLIC MOBILE "+mode+" frame blank/slow/disconnected: "+JSON.stringify(evidence));
 }
 console.log("NATIVE_PUBLIC_MOBILE "+JSON.stringify(visualEvidence.filter(e=>e.device.startsWith("mobile"))));
 console.log("NATIVE_PUBLIC_GAMEPLAY "+JSON.stringify(modes.map(m=>({
  mode:m.mode,pixels:m.pixels,meshCount:m.meshCount,
  cityBuilt:m.cityBuilt,backlogMs:m.backlogMs
 }))));
 console.log("Native public preview: real OSM geometry, Box3D collisions, 4 nonblank camera modes and bounded input latency verified");
}finally{
 writeFileSync(visualDir+"/evidence.json",JSON.stringify({
  url:address,source:"public HTTPS native OSM preview",softwareGpuEmulation:true,
  physicalDeviceAcceptance:false,frames:visualEvidence,diagnostics:diagnostics.slice(-20)
 },null,2)+"\n");
 await browser.close();
}
