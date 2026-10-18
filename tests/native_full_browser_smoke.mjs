// Genuine browser startup smoke, NOT real-device GPU performance proof.
// Runs the full SELF-CONTAINED compiled HTML with actual pinned Box3D,
// real Emscripten Flight Core, one WebGL2 device and non-synthetic actors.
import puppeteer from "puppeteer-core";
import {PNG} from "pngjs";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const input=process.argv[2];
if(!input||!process.env.CHROME_BIN)throw Error("usage: CHROME_BIN=... node tests/native_full_browser_smoke.mjs <built-native-game.html>");
const html=readFileSync(resolve(input),"utf8");
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN,args:[
 "--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist",
 "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"
]});
const errors=[];
const folder="artifacts/native-browser-smoke";mkdirSync(folder,{recursive:true});
// The previous CI was green while the actual mobile screenshot was almost
// solid brown: counting WebGL draws is NOT a visual-release proof.
// Reject an unpainted native canvas before any "working renderer" claim.
function scenePixelEvidence(pngBuffer){
 const png=PNG.sync.read(pngBuffer),seen=new Map(),rangeLo=[255,255,255],rangeHi=[0,0,0];
 let count=0;
 // Ignore top telemetry, bottom controls and edges; these can make a blank
 // WebGL surface appear colorful in a whole-page screenshot.
 for(let y=Math.floor(png.height*.19);y<Math.floor(png.height*.73);y+=9)
  for(let x=Math.floor(png.width*.13);x<Math.floor(png.width*.87);x+=9){
   const i=(png.width*y+x)*4,r=png.data[i],g=png.data[i+1],b=png.data[i+2];
   const key=(r<<16)|(g<<8)|b;seen.set(key,(seen.get(key)||0)+1);count++;
   for(const [j,v] of [r,g,b].entries()){
    rangeLo[j]=Math.min(rangeLo[j],v);rangeHi[j]=Math.max(rangeHi[j],v);
   }
  }
 const dominant=Math.max(...seen.values()),nonDominant=1-dominant/count;
 const spread=Math.max(...rangeHi.map((hi,i)=>hi-rangeLo[i]));
 return {pixelSamples:count,colors:seen.size,nonDominant:+nonDominant.toFixed(5),
  channelSpread:spread};
}
function assertVisibleWorld(evidence,label){
 if(evidence.colors<3||evidence.channelSpread<40||evidence.nonDominant<.005)
  throw Error(label+" WebGL2 rendered a blank/featureless game. "+JSON.stringify(evidence));
}
let data=null;
try{
 const page=await browser.newPage();
 page.on("pageerror",e=>errors.push(String(e)));
 page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text().slice(0,280));});
 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
 await page.setContent(html,{waitUntil:"load",timeout:45000});
 await page.waitForSelector("#gameMenuStart:not([disabled])",{timeout:10000});
 await page.click("#gameMenuStart");
 await page.waitForFunction(()=>document.documentElement.dataset.engine==="native-webgl2",{timeout:45000});
 await page.waitForFunction(()=>document.getElementById("telemetry")?.textContent?.includes("ticks"),{timeout:25000});
 let details=await page.evaluate(()=>{
  const c=document.querySelector("#nativeCanvas"),gl=c?.getContext("webgl2");
  return {engine:document.documentElement.dataset.engine,canvasCount:document.querySelectorAll("canvas").length,
   renderer:document.querySelector("#viewport")?.dataset.renderer,canvasWidth:c?.width,canvasHeight:c?.height,
   actualWebgl2:!!gl,glError:gl?.getError(),firstMode:document.querySelector("[data-mode][aria-pressed=true]")?.dataset.mode,
   gpuVendor:gl?.getParameter(gl.RENDERER),status:document.getElementById("status")?.textContent};
 });
 if(!details.actualWebgl2||details.canvasCount!==1||details.renderer!=="native-webgl2-only"||details.glError!==0)
  throw Error("Native-only compositor did not start with one healthy WebGL2 backbuffer: "+JSON.stringify(details));
 const desktopPixels=scenePixelEvidence(await page.screenshot({path:folder+"/native-desktop.png"}));
 assertVisibleWorld(desktopPixels,"desktop");
 const modes=[];
 for(const mode of ["foot","car","jet","drone"]){
  await page.click('[data-mode="'+mode+'"]');
  await page.waitForFunction(want=>document.querySelector('[data-mode="'+want+'"]')?.getAttribute("aria-pressed")==="true",
   {timeout:8000},mode);
  await new Promise(r=>setTimeout(r,140));
  modes.push(mode);
 }
 // Changing Puppeteer's isMobile/hasTouch on an existing page forces an
 // implicit reload. Start an independent MOBILE WebGL2 game instead.
 const mobilePage=await browser.newPage();
 mobilePage.on("pageerror",e=>errors.push("mobile: "+String(e)));
 mobilePage.on("console",m=>{if(m.type()==="error")errors.push("mobile console: "+m.text().slice(0,280));});
 await mobilePage.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mobilePage.setContent(html,{waitUntil:"load",timeout:45000});
 await mobilePage.waitForSelector("#gameMenuStart:not([disabled])",{timeout:10000});
 await mobilePage.click("#gameMenuStart");
 await mobilePage.waitForFunction(()=>document.documentElement.dataset.engine==="native-webgl2",{timeout:45000});
 await mobilePage.waitForFunction(()=>document.getElementById("telemetry")?.textContent?.includes("ticks"),{timeout:25000});
 await new Promise(r=>setTimeout(r,220));
 const mobile=await mobilePage.evaluate(()=>{
  const c=document.querySelector("#nativeCanvas"),r=c.getBoundingClientRect();
  const gl=c?.getContext("webgl2");
  return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,
   gl:!!gl,glError:gl?.getError(),
   gameFullscreen:Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2,
   touchAction:getComputedStyle(c).touchAction};
 });
 if(!mobile.gl||mobile.glError!==0||!mobile.gameFullscreen||mobile.width<780||mobile.height<1600||mobile.touchAction!=="none")
  throw Error("Native PWA touch/DPR/full-window broken: "+JSON.stringify(mobile));
 if(errors.length)throw Error("Browser console errors: "+errors.join(" | ").slice(0,1200));
 const mobileScreenshot=await mobilePage.screenshot({path:folder+"/native-mobile.png",fullPage:true});
 const mobilePixels=scenePixelEvidence(mobileScreenshot);
 assertVisibleWorld(mobilePixels,"mobile");
 const telemetry=await mobilePage.$eval("#telemetry",el=>el.textContent);
 const backlogMs=Number(telemetry.match(/backlog ([\d.]+)/)?.[1]);
 if(!Number.isFinite(backlogMs)||backlogMs>150)
  throw Error("Native pilot remains >150ms behind input; CPU physics still stalls: "+telemetry);
 data={...details,modes,mobile,desktopPixels,mobilePixels,backlogMs,errors,
  rendererProvenance:"compiled native browser, software smoke only"};
 writeFileSync(folder+"/metrics.json",JSON.stringify(data,null,2)+"\n");
 console.log("NATIVE_FULL_BROWSER "+JSON.stringify(data));
}catch(error){
 console.error("NATIVE_FULL_BROWSER_FAIL",error);
 if(errors.length)console.error("NATIVE_BROWSER_CONSOLE "+JSON.stringify(errors));
 process.exitCode=1;
}finally{await browser.close();}
