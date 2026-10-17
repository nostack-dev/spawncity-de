import puppeteer from "puppeteer-core";
import {mkdir,writeFile} from "node:fs/promises";
const chrome=process.env.CHROME_BIN;
if(!chrome)throw Error("CHROME_BIN required");
const out="artifacts/native-scene";await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const errors=[];
try{
 const page=await browser.newPage();page.on("pageerror",error=>errors.push(String(error?.stack||error)));
 await page.setViewport({width:960,height:540,deviceScaleFactor:1});
 await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="native-scene" width="960" height="540"></canvas>');
 await page.addScriptTag({path:process.env.NATIVE_SCENE_BUNDLE||"/tmp/native-scene.bundle.js"});
 await page.waitForFunction(()=>Boolean(globalThis.__nativeSceneProof),{timeout:45000});
 const data=await page.evaluate(()=>globalThis.__nativeSceneProof);
 const png=Buffer.from(data.imageDataUri.split(",")[1],"base64");delete data.imageDataUri;
 data.errors=errors;
 await writeFile(out+"/native-scene.png",png);
 await writeFile(out+"/metrics.json",JSON.stringify(data,null,2)+"\n");
 console.log("NATIVE_SCENE_GPU_PROOF "+JSON.stringify(data));
 if(errors.length||data.glError!==0||data.culledMeshes<1||data.drawCalls!==4+data.osmCityChunks||data.instances!==937+data.osmCityChunks||data.osmBuildingFootprints!==2||data.indexedCityChunks<1||data.savedCityGpuBytes<=0||data.triangles<10000||data.nonBackgroundPixels<6000)process.exitCode=1;
}catch(error){console.error("NATIVE_SCENE_GPU_ERROR",error);process.exitCode=1;}
finally{await browser.close();}
