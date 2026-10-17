import puppeteer from "puppeteer-core";
import {mkdir,writeFile} from "node:fs/promises";
const chrome=process.env.CHROME_BIN,source=process.env.NATIVE_REAL_CITY_BUNDLE||"/tmp/native-real-city.bundle.js";
const origin=(process.argv[2]||"https://spawncity.de/drone_simulator.html");
if(!chrome)throw Error("CHROME_BIN is required");
const out="artifacts/native-real-city";await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const page=await browser.newPage(),errors=[];
page.on("pageerror",e=>errors.push(String(e).slice(0,350)));
try{
 await page.setViewport({width:960,height:540,deviceScaleFactor:1});
 const url=new URL(origin);url.searchParams.set("menu","1");url.searchParams.set("time","day");
 await browser.defaultBrowserContext().overridePermissions(url.origin,["geolocation"]);
 await page.setGeolocation({latitude:52.5208,longitude:13.4094,accuracy:5});
 await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>document.getElementById("gameMenuStart")?.textContent?.trim()==="START",{timeout:60000});
 await page.click("#gameMenuStart");
 await page.waitForFunction(()=>document.querySelector("#gameMenu")?.hidden===true,{timeout:60000});
 await page.waitForFunction(()=>{
   const b=globalThis.__arondightRealWorld,v=document.querySelector("#viewport");
   return v?.dataset.worldMode==="real"&&b?.threeScene?.getObjectByName("WORLD_CITY_BUILDINGS")
     && Number(v.dataset.worldCityChunks||0)>=1;
 },{timeout:90000,polling:500});
 await page.addScriptTag({path:source});
 const result=await page.evaluate(async()=>await globalThis.__runNativeRealCityProof());
 for(const key of ["threeImage","nativeImage"]){
   const png=Buffer.from(result[key].split(",")[1],"base64");
   await writeFile(out+"/"+(key==="threeImage"?"three.png":"native.png"),png);
   delete result[key];
 }
 result.errors=errors;
 await writeFile(out+"/metrics.json",JSON.stringify(result,null,2)+"\n");
 const esc=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
 await writeFile(out+"/comparison.html",'<meta charset="utf-8"><title>Real SpawnCity geometry: Three vs native WebGL2</title><style>body{background:#161b25;color:#eee;font:14px system-ui;margin:20px}section{display:flex;gap:14px}article{max-width:49%}img{width:100%}</style><h1>Actual streamed city triangles, unlit shader parity only</h1><p>This does not match full game PBR facades, shadows, sky, bloom or actors. CI runs software WebGL.</p><section><article><h2>Three.js WebGL</h2><img src="three.png"></article><article><h2>Native WebGL2</h2><img src="native.png"></article></section><pre>'+esc(JSON.stringify(result,null,2))+"</pre>");
 console.log("REAL_CITY_NATIVE_GL "+JSON.stringify(result));
 if(!result.triangles||result.pixelsDifferentOver20>1||result.rgbMeanAbsoluteDifference>3||errors.length)process.exitCode=1;
}catch(e){console.error("REAL_CITY_NATIVE_GL ERROR",e);process.exitCode=1;}
finally{await browser.close();}
