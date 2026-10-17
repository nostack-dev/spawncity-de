import puppeteer from "puppeteer-core";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const chrome=process.env.CHROME_BIN;
if(!chrome)throw Error("CHROME_BIN missing");
const urls=[process.argv[2]||"https://spawncity.de/drone_simulator.html",process.argv[3]||process.argv[2]||"https://spawncity.de/drone_simulator.html"];
const out="artifacts/renderer-ab";
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const results=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  for(const [device,dimensions] of Object.entries({desktop:{width:1280,height:720,deviceScaleFactor:1},mobile:{width:844,height:390,deviceScaleFactor:1,isMobile:true,hasTouch:true}})){
    for(let i=0;i<2;i++){
      const label=i?"candidate":"baseline",preset=i?"fast":"quality";
      const url=new URL(urls[i]);url.searchParams.set("menu","1");url.searchParams.set("time","day");url.searchParams.set("render",preset);
      const context=await browser.createBrowserContext(),page=await context.newPage();
      const entry={device,label,preset,url:url.href,errors:[]};
      results.push(entry);
      page.on("pageerror",err=>entry.errors.push(String(err)));
      try{
        await page.setViewport(dimensions);
        if(device==="mobile")await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile Safari/604.1");
        await context.overridePermissions(url.origin,["geolocation"]);
        await page.setGeolocation({latitude:52.5208,longitude:13.4094,accuracy:5});
        await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:60000});
        await page.waitForFunction(()=>document.querySelector("#gameMenuStart")?.textContent?.trim()==="START",{timeout:60000});
        await page.click("#gameMenuStart");
        await page.waitForFunction(()=>document.querySelector("#gameMenu")?.hidden===true&&Number(globalThis.__arondightDiagnostics?.presentationDraws)>3,{timeout:30000});
        await sleep(3000);
        const first=await page.evaluate(()=>({t:performance.now(),d:globalThis.__arondightDiagnostics.presentationDraws,s:globalThis.__arondightDiagnostics.simTime}));
        await sleep(5000);
        const last=await page.evaluate(()=>{
          const d=globalThis.__arondightDiagnostics,r=globalThis.__arondightRealWorld?.threeRenderer;
          return {t:performance.now(),d:d.presentationDraws,s:d.simTime,p50:d.presentationTiming.p50Ms,p95:d.presentationTiming.p95Ms,software:d.presentationSoftwareRaster,dpr:d.presentationPixelRatio,preset:document.querySelector("#viewport")?.dataset.renderPreset,world:document.querySelector("#viewport")?.dataset.worldMode,calls:r?.info?.render?.calls??null,triangles:r?.info?.render?.triangles??null};
        });
        entry.fps=+((last.d-first.d)/((last.t-first.t)/1000)).toFixed(2);
        entry.simRate=+((last.s-first.s)/((last.t-first.t)/1000)).toFixed(3);
        Object.assign(entry,{p50:last.p50,p95:last.p95,software:last.software,dpr:last.dpr,actualPreset:last.preset,world:last.world,calls:last.calls,triangles:last.triangles});
        entry.image=device+"-"+label+".png";
        await page.screenshot({path:out+"/"+entry.image});
        if(!entry.actualPreset||entry.fps<1)throw Error("No measured WebGL frame or render preset");
      }catch(err){entry.error=String(err);process.exitCode=1;}
      finally{await context.close();}
    }
  }
}finally{await browser.close();}
const esc=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
let html='<!doctype html><meta charset="utf-8"><title>SpawnCity WebGL A/B</title><style>body{font:14px system-ui;background:#151a21;color:#eee}section{display:flex;gap:12px;flex-wrap:wrap}article{flex:1 1 400px}img{width:100%}pre{white-space:pre-wrap}</style><h1>WebGL screenshot and performance comparison</h1><p>Same browser, GPS and viewport. Animated scenes are not pixel deterministic. SwiftShader FPS is not hardware evidence.</p>';
for(const device of ["desktop","mobile"]){
  html+="<h2>"+device+"</h2><section>";
  for(const entry of results.filter(r=>r.device===device)){
    html+="<article><h3>"+esc(entry.label)+"</h3>";
    if(entry.image)html+='<img src="data:image/png;base64,'+(await readFile(out+"/"+entry.image)).toString("base64")+'">';
    html+="<pre>"+esc(JSON.stringify({...entry,url:undefined,image:undefined},null,2))+"</pre></article>";
  }
  html+="</section>";
}
await writeFile(out+"/comparison.html",html);
await writeFile(out+"/metrics.json",JSON.stringify(results,null,2)+"\n");
console.log(JSON.stringify(results.map(r=>({device:r.device,label:r.label,fps:r.fps,dpr:r.dpr,software:r.software,error:r.error})),null,2));
