import puppeteer from "puppeteer-core";
import {mkdir,writeFile} from "node:fs/promises";
if(!process.env.CHROME_BIN)throw Error("CHROME_BIN required");
const out="artifacts/native-world";await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const errors=[];
try{
 const page=await browser.newPage();page.on("pageerror",error=>errors.push(String(error)));
 await page.setViewport({width:960,height:540,deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="native-world" width="960" height="540" style="width:960px;height:540px"></canvas>');
 await page.addScriptTag({path:"/tmp/native-world.bundle.js"});
 await page.waitForFunction(()=>!!globalThis.__nativeWorldProof,{timeout:45000});
 const data=await page.evaluate(()=>globalThis.__nativeWorldProof);
 data.errors=errors;
 await writeFile(out+"/metrics.json",JSON.stringify(data,null,2)+"\n");
 console.log("NATIVE_WORLD_PROOF "+JSON.stringify(data));
 if(data.error||errors.length||data.glError!==0||!data.hiDpiVerified||!data.touchPickingVerified||data.modesVerified!==5||!data.singleContextAllModes||data.shadowDrawCalls<2||!data.shadowRestored||(data.contextLossExtension&&!data.contextRestored)||data.sources?.box3d!==2||data.sources?.flight!==1||data.sources?.buildings!==16||data.sources?.terrain<1||data.sources?.roads<1||data.sources?.people!==2||data.sources?.peer!==1||data.drawCalls<5||data.drawnTriangles<50||data.nonBlank<3000)process.exitCode=1;
}catch(error){console.error("NATIVE_WORLD_ERROR",error);process.exitCode=1;}
finally{await browser.close();}
