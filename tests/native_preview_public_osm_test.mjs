// Verify an ACTUALLY DEPLOYED native preview: real HTTPS app origin,
// real OpenStreetMap buildings, and collision hulls in the same Box3D world.
// No mocked OSM response and no synthetic city count. Separate from the
// opaque-origin offline renderer smoke, which only tests GPU/physics fallback.
import puppeteer from "puppeteer-core";
const address=process.argv[2];
if(!address?.startsWith("https://")||!process.env.CHROME_BIN)
 throw Error("Usage: CHROME_BIN=/usr/bin/chromium node tests/native_preview_public_osm_test.mjs https://spawncity.de/native/");
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN,
 args:["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--ignore-gpu-blocklist",
  "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const diagnostics=[];
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
  roadSegments:data.probe?.roadSegments,diagnostics:diagnostics.slice(-8)}));
 if(!data.status?.includes("real OSM buildings"))
  throw Error("Public native world has no real OSM buildings: "+data.status+" "+diagnostics.slice(-6).join(" | "));
 if(!(data.probe?.buildingColliders>0)||!(data.probe?.cityStats?.built>0))
  throw Error("Public OSM visible/collision proof missing: "+JSON.stringify(data.probe));
 console.log("Native public preview: real Overpass buildings rendered + authoritative Box3D collision verified");
}finally{await browser.close();}
