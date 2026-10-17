import puppeteer from "puppeteer-core";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const chrome=process.env.CHROME_BIN;if(!chrome)throw Error("CHROME_BIN required");
const out="artifacts/native-webgl-proof";await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
try{
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="three-canvas" width="960" height="540"></canvas><canvas id="native-canvas" width="960" height="540"></canvas>');
 await page.addScriptTag({path:process.env.NATIVE_PROOF_BUNDLE||"/tmp/native-webgl-proof.bundle.js"});
 await page.waitForFunction(()=>Boolean(globalThis.__nativeProof),{timeout:120000});
 const result=await page.evaluate(()=>globalThis.__nativeProof);
 for(const type of ["three","native"]){
  const data=result[type+"DataUrl"].split(",")[1];
  await writeFile(out+"/"+type+".png",Buffer.from(data,"base64"));
  delete result[type+"DataUrl"];
 }
 result.errors=errors;
 await writeFile(out+"/metrics.json",JSON.stringify(result,null,2)+"\n");
 await writeFile(out+"/comparison.html",'<!doctype html><meta charset="utf-8"><title>Same geometry: Three WebGL vs raw WebGL2</title><style>body{background:#171b24;color:#eee;font:14px system-ui;margin:24px}section{display:flex;gap:12px;flex-wrap:wrap}img{width:100%;max-width:960px}article{flex:1 1 450px}</style><h1>Batched static city test (not gameplay renderer)</h1><p>Identical unlit triangles, camera, resolution and draw-call count. This does NOT establish parity of SpawnCity shaders, shadows, animated actors, UI or effects. Runner uses software WebGL; device GPU benchmark is still required.</p><section><article><h2>Three WebGL</h2><img src="three.png"></article><article><h2>Raw WebGL2</h2><img src="native.png"></article></section><pre>'+JSON.stringify(result,null,2)+'</pre>');
 console.log("NATIVE_WEBGL_PROOF "+JSON.stringify(result));
 if(errors.length)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}
finally{await browser.close();}
