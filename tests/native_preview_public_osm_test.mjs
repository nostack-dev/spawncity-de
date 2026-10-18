// Verify an ACTUALLY DEPLOYED native preview: real HTTPS app origin,
// real OpenStreetMap buildings, and collision hulls in the same Box3D world.
// No mocked OSM response and no synthetic city count. Separate from the
// opaque-origin offline renderer smoke, which only tests GPU/physics fallback.
import puppeteer from "puppeteer-core";
import {PNG} from "pngjs";
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
 // A sky-only gradient has hundreds of colors but essentially NO horizontal
 // silhouette/geometry edges. Real 3-D buildings, streets, cars and walls
 // produce lateral contrast. User screenshots showed exactly this false-green.
 // Count adjacent horizontal samples only within the unobstructed 3D viewport.
 let lateralEdges=0,lateralSamples=0,lateralContrast=0,rowsWithGeometry=0;
 let n=0;
 const stride=7;
 for(let y=Math.round(png.height*.23);y<Math.round(png.height*.72);y+=stride){
  let rowEdges=0;
  const start=Math.round(png.width*.16),end=Math.round(png.width*.83);
  for(let x=start;x<end;x+=stride){
   const offset=(y*png.width+x)*4;
   const rgb=[png.data[offset],png.data[offset+1],png.data[offset+2]];
   const key=(rgb[0]<<16)|(rgb[1]<<8)|rgb[2];
   counts.set(key,(counts.get(key)||0)+1);n++;
   rgb.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
   if(x<start+stride)continue;
   const previous=offset-stride*4;
   const contrast=Math.max(...rgb.map((v,i)=>Math.abs(v-png.data[previous+i])));
   lateralContrast+=contrast;lateralSamples++;
   if(contrast>=18){lateralEdges++;rowEdges++;}
  }
  if(rowEdges>=2)rowsWithGeometry++;
 }
 return {uniqueColors:counts.size,pixelSamples:n,
  channelSpread:Math.max(...max.map((v,i)=>v-min[i])),
  diverseRatio:n?(1-Math.max(...counts.values())/n):0,
  lateralEdgeRatio:lateralSamples?lateralEdges/lateralSamples:0,
  lateralContrastMean:lateralSamples?lateralContrast/lateralSamples:0,
  geometryRows:rowsWithGeometry};
}
const hasWorldPixels=p=>p.pixelSamples>200&&p.uniqueColors>6
 &&p.channelSpread>=30&&p.diverseRatio>.015
 // The old screenshot showed 1,300 OSM buildings + 72 GPU draws, yet only
 // a horizontally uniform sky; sky gradients must never satisfy this gate.
 &&p.lateralEdgeRatio>.012&&p.geometryRows>=3;

const diagnostics=[];
try{
 const page=await browser.newPage();
 // Diagnostic instrumentation is installed ONLY in Chromium E2E. The actual
 // published game remains untouched. If the real city seems blank despite
 // 1300 meshes, identify whether GPU face or depth rejection hides it.
 await page.evaluateOnNewDocument(()=>{
  const proto=WebGL2RenderingContext.prototype,terrainLocations=new WeakSet(),activeTerrain=new WeakMap();
  const getUniform=proto.getUniformLocation;
  proto.getUniformLocation=function(program,name){
   const location=getUniform.call(this,program,name);
   if(name==="uTerrain"&&location)terrainLocations.add(location);
   return location;
  };
  const uniform1i=proto.uniform1i;
  proto.uniform1i=function(location,value){
   if(location&&terrainLocations.has(location))activeTerrain.set(this,value===1);
   return uniform1i.call(this,location,value);
  };
  const useProgram=proto.useProgram;
  proto.useProgram=function(...args){activeTerrain.set(this,false);return useProgram.apply(this,args);};
  for(const name of ["drawElementsInstanced","drawArraysInstanced"]){
   const draw=proto[name];
   proto[name]=function(...args){
    if(window.__nativeDiagnosticSkipTerrain&&activeTerrain.get(this))return;
    if(window.__nativeDiagnosticNoCull)this.disable(this.CULL_FACE);
    if(window.__nativeDiagnosticNoDepth)this.disable(this.DEPTH_TEST);
    return draw.apply(this,args);
   };
  }
 });
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
  await page.waitForFunction(want=>
   document.querySelector('[data-mode="'+want+'"]')?.getAttribute("aria-pressed")==="true"
   &&document.querySelector("#telemetry")?.textContent?.startsWith(want.toUpperCase()+" · "),
   {timeout:30000,polling:150},mode);
  // With Chromium SwiftShader a real 1300-building GPU frame can take >300 ms.
  // Never sample a stale/half-presented frame on a 420-ms arbitrary timeout.
  // Require a SECOND completed game render after the mode switch.
  const firstTelemetry=await page.$eval("#telemetry",el=>el.textContent);
  await page.waitForFunction(({mode,first})=>{
   const current=document.querySelector("#telemetry")?.textContent;
   return current!==first&&current?.startsWith(mode.toUpperCase()+" · ");
  },{timeout:30000,polling:150},{mode,first:firstTelemetry});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const observed=await page.evaluate(()=>({
   renderer:document.querySelector("#viewport")?.dataset.renderer,
   telemetry:document.querySelector("#telemetry")?.textContent,
   probe:window.__spawncityNativeProbe?.()??null
  }));
  const pixels=centralWorldPixels(await page.screenshot());
  modes.push({mode,pixels,camera:observed.probe?.camera,
   meshCount:observed.probe?.meshCount,meshClasses:observed.probe?.meshClasses,
   gpu:observed.probe?.gpu,cityBuilt:observed.probe?.cityStats?.built,
   backlogMs:observed.probe?.backlogMs});
  if(observed.renderer!=="native-webgl2-only"||!observed.probe?.camera
   ||!(observed.probe.meshCount>50)||!(observed.probe.cityStats?.built>0)
   ||!hasWorldPixels(pixels)){
   const diagnostic={};
   if(mode==="foot"){
    await page.evaluate(()=>{window.__nativeDiagnosticNoCull=true;});
    await new Promise(done=>setTimeout(done,260));
    diagnostic.noCulling=centralWorldPixels(await page.screenshot());
    await page.evaluate(()=>{window.__nativeDiagnosticNoCull=false;window.__nativeDiagnosticSkipTerrain=true;});
    await new Promise(done=>setTimeout(done,650));
    diagnostic.skipTerrain=centralWorldPixels(await page.screenshot());
    await page.evaluate(()=>{window.__nativeDiagnosticSkipTerrain=false;window.__nativeDiagnosticNoCull=true;window.__nativeDiagnosticNoDepth=true;});
    await new Promise(done=>setTimeout(done,650));
    diagnostic.noCullingNoDepth=centralWorldPixels(await page.screenshot());
    await page.evaluate(()=>{window.__nativeDiagnosticNoCull=false;window.__nativeDiagnosticNoDepth=false;});
   }
   throw Error("Actual public native "+mode+" gameplay view blank or disconnected: "+
    JSON.stringify({...modes.at(-1),diagnostic}));
  }
  if(!(observed.probe.backlogMs<135))
   throw Error("Native "+mode+" physics latency unbounded: "+observed.probe.backlogMs);
 }
 console.log("NATIVE_PUBLIC_GAMEPLAY "+JSON.stringify(modes.map(m=>({
  mode:m.mode,pixels:m.pixels,meshCount:m.meshCount,
  cityBuilt:m.cityBuilt,backlogMs:m.backlogMs
 }))));
 console.log("Native public preview: real OSM geometry, Box3D collisions, 4 nonblank camera modes and bounded input latency verified");
}finally{await browser.close();}
