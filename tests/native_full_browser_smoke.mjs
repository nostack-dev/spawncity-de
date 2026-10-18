// Genuine browser startup smoke, NOT real-device GPU performance proof.
// Runs the full SELF-CONTAINED compiled HTML with actual pinned Box3D,
// real Emscripten Flight Core, one WebGL2 device and non-synthetic actors.
import puppeteer from "puppeteer-core";
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
 const modes=[];
 for(const mode of ["foot","car","jet","drone"]){
  await page.click('[data-mode="'+mode+'"]');
  await page.waitForFunction(want=>document.querySelector('[data-mode="'+want+'"]')?.getAttribute("aria-pressed")==="true",
   {timeout:8000},mode);
  await new Promise(r=>setTimeout(r,140));
  modes.push(mode);
 }
 await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await new Promise(r=>setTimeout(r,220));
 const mobile=await page.evaluate(()=>{
  const c=document.querySelector("#nativeCanvas"),r=c.getBoundingClientRect();
  return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,
   gameFullscreen:Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2,
   touchAction:getComputedStyle(c).touchAction};
 });
 if(!mobile.gameFullscreen||mobile.width<780||mobile.height<1600||mobile.touchAction!=="none")
  throw Error("Native PWA touch/DPR/full-window broken: "+JSON.stringify(mobile));
 if(errors.length)throw Error("Browser console errors: "+errors.join(" | ").slice(0,1200));
 data={...details,modes,mobile,errors,rendererProvenance:"compiled real native game, software smoke only"};
 await page.screenshot({path:folder+"/native-mobile.png",fullPage:true});
 writeFileSync(folder+"/metrics.json",JSON.stringify(data,null,2)+"\n");
 console.log("NATIVE_FULL_BROWSER "+JSON.stringify(data));
}catch(error){
 console.error("NATIVE_FULL_BROWSER_FAIL",error);
 if(errors.length)console.error("NATIVE_BROWSER_CONSOLE "+JSON.stringify(errors));
 process.exitCode=1;
}finally{await browser.close();}
