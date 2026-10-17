import puppeteer from "puppeteer-core";
import {PNG} from "pngjs";
import {mkdir,writeFile} from "node:fs/promises";
const exe=process.env.CHROME_BIN;
if(!exe)throw Error("CHROME_BIN missing");
const out="artifacts/native-city-live";await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:exe,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const page=await browser.newPage(),sleep=t=>new Promise(r=>setTimeout(r,t)),issues=[];
page.on("pageerror",err=>issues.push(String(err?.stack||err).slice(0,1200)));
try{
 await page.setViewport({width:960,height:540,deviceScaleFactor:1});
 const url=new URL(process.argv[2]||"https://spawncity.de/drone_simulator.html");
 url.searchParams.set("menu","1");url.searchParams.set("time","day");
 await browser.defaultBrowserContext().overridePermissions(url.origin,["geolocation"]);
 await page.setGeolocation({latitude:52.5208,longitude:13.4094,accuracy:5});
 await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>document.getElementById("gameMenuStart")?.textContent?.trim()==="START",{timeout:60000});
 await page.click("#gameMenuStart");
 await page.waitForFunction(()=>document.querySelector("#gameMenu")?.hidden===true,{timeout:60000});
 await page.waitForFunction(()=>Number(document.querySelector("#viewport")?.dataset.worldCityChunks||0)>0,{timeout:90000,polling:500});
 const sample=()=>page.evaluate(()=>({now:performance.now(),frames:Number(globalThis.__arondightDiagnostics?.presentationDraws)||0,dpr:globalThis.__arondightDiagnostics?.presentationPixelRatio,calls:globalThis.__arondightRealWorld?.threeRenderer?.info?.render?.calls,world:document.querySelector("#viewport")?.dataset.worldMode}));
 const first=await sample();await sleep(5000);const second=await sample(),baselineFps=(second.frames-first.frames)/((second.now-first.now)/1000);
 const before=await page.screenshot({type:"png"});await writeFile(out+"/baseline.png",before);
 await page.addScriptTag({path:process.env.NATIVE_CITY_LIVE_BUNDLE||"/tmp/native-city-live.bundle.js"});
 await page.evaluate(()=>globalThis.__nativeCityTrial=globalThis.__installNativeCityTrial());
 await sleep(1500);
 // Draw both candidate and reference synchronously inside ONE original game
 // render callback. Previous "before vs after 5 s" screenshots weren't a
 // valid appearance comparison because camera/game state advanced.
 await page.evaluate(()=>{globalThis.__nativeCityTrial.info.captureNext=true;});
 await page.waitForFunction(()=>globalThis.__nativeCityTrial?.info?.matched?.candidate?.rgba?.length>0,{timeout:25000,polling:250});
 const matched=await page.evaluate(()=>{
   const trial=globalThis.__nativeCityTrial.info,result=trial.matched;
   delete trial.matched;return result;
 });
 if(!matched||matched.reference.w!==matched.candidate.w||matched.reference.h!==matched.candidate.h)
   throw Error("Identical viewport/frame capture failed");
 const encodeFrame=async(frame,file)=>{
   const image=new PNG({width:frame.w,height:frame.h});
   for(let y=0;y<frame.h;y++){
     const src=(frame.h-1-y)*frame.w*4,dst=y*frame.w*4;
     image.data.set(frame.rgba.slice(src,src+frame.w*4),dst);
   }
   await writeFile(out+"/"+file,PNG.sync.write(image));
 };
 await encodeFrame(matched.reference,"same-frame-three.png");
 await encodeFrame(matched.candidate,"same-frame-native.png");
 let sameFrameError=0,sameFrameLarge=0;
 for(let i=0;i<matched.reference.rgba.length;i+=4){
   const d=(Math.abs(matched.reference.rgba[i]-matched.candidate.rgba[i])
     +Math.abs(matched.reference.rgba[i+1]-matched.candidate.rgba[i+1])
     +Math.abs(matched.reference.rgba[i+2]-matched.candidate.rgba[i+2]))/3;
   sameFrameError+=d;if(d>20)sameFrameLarge++;
 }
 const matchedPixelCount=matched.reference.w*matched.reference.h;
 const sameFrameMeanRgb=+(sameFrameError/matchedPixelCount).toFixed(3);
 const sameFramePixelsOver20=+(100*sameFrameLarge/matchedPixelCount).toFixed(3);
 const third=await sample();await sleep(5000);const fourth=await sample(),candidateFps=(fourth.frames-third.frames)/((fourth.now-third.now)/1000);
 const after=await page.screenshot({type:"png"});await writeFile(out+"/native-city.png",after);
 const a=PNG.sync.read(before),b=PNG.sync.read(after);if(a.width!==b.width||a.height!==b.height)throw Error("Screenshot viewport changed");
 let total=0,large=0;for(let i=0;i<a.data.length;i+=4){
   const d=(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]))/3;
   total+=d;if(d>20)large++;
 }
 const info=await page.evaluate(()=>globalThis.__nativeCityTrial?.info||null);
 await page.evaluate(()=>globalThis.__nativeCityTrial?.stop?.());
 const result={schema:"spawncity-live-native-city-experiment-v1",baseUrl:url.origin,geometry:"actual production streamed city",gpu:"Chromium ANGLE SwiftShader (not hardware)",baselineFps:+baselineFps.toFixed(2),candidateFps:+candidateFps.toFixed(2),fpsGainPct:+(100*(candidateFps-baselineFps)/Math.max(.01,baselineFps)).toFixed(2),
   meanRgbScreenshotDifference:+(total/(a.width*a.height)).toFixed(2),pixelsDifferentOver20Pct:+(100*large/(a.width*a.height)).toFixed(2),
   drawCallsBefore:second.calls,drawCallsAfter:fourth.calls,baselineDpr:second.dpr,candidateDpr:fourth.dpr,
   sameFrame:{width:matched.reference.w,height:matched.reference.h,meanRgbError:sameFrameMeanRgb,pixelsDifferentOver20Pct:sameFramePixelsOver20,
     nativeDrawCalls:matched.nativeDrawCalls,triangles:matched.triangles,reference:"same-frame-three.png",candidate:"same-frame-native.png"},
   passes:info?.passes||0,totalNativeDraws:info?.draws||0,errors:[...issues,...(info?.errors||[])]};
 await writeFile(out+"/metrics.json",JSON.stringify(result,null,2)+"\n");
 await writeFile(out+"/comparison.html",'<meta charset="utf-8"><style>body{background:#181c24;color:#eaf2ff;font:14px system-ui;margin:18px}section{display:flex;gap:12px}article{width:50%}img{width:100%}</style><h1>Real SpawnCity full-frame trial: native city solids inside existing Three scene</h1><p>Expected to differ: the candidate city has no facade PBR/shadow shaders yet. The first two images below are from THE SAME camera and frame. The 5-second before/after pair remains timing-only. Device is SwiftShader software WebGL; raw numbers do not establish hardware speedup.</p><section><article><h2>Exact same frame: Three.js</h2><img src="same-frame-three.png"></article><article><h2>Exact same frame: native WebGL2 city</h2><img src="same-frame-native.png"></article></section><pre>'+JSON.stringify(result,null,2)+"</pre>");
 console.log("NATIVE_CITY_LIVE "+JSON.stringify(result));
 if(result.passes<10||result.totalNativeDraws<10||result.errors.length)process.exitCode=1;
}catch(e){console.error("NATIVE_CITY_LIVE_ERROR",e);process.exitCode=1;}
finally{await browser.close();}
