// Production-shaped browser bootstrap for one native WebGL2 game.
// Both WASM engines are compiled from this repository's pinned original
// sources, with no CDN, THREE, legacy graphics path or second renderer.
import Box3DFactory from "box3d.js/dist/box3d.inline.mjs";
import FlightCoreFactory from "../generated/flight_core.mjs";
import {NativeGameRuntime} from "./native_game_runtime.mjs";
import {NativeGameInput} from "./native_game_input.mjs";
import {fetchNativeOsm} from "./native_osm_source.mjs";
export const NATIVE_BROWSER_BOOT_VERSION="single-repo-no-three-full-game-boot-v1";
const $=id=>document.getElementById(id);
const viewport=$("viewport"),startButton=$("gameMenuStart"),menu=$("overlay"),
 status=$("status"),menuStatus=$("gameMenuStatus"),telemetry=$("telemetry");
if(!viewport||!startButton||!menu||!status)throw Error("SpawnCity native boot requires its real fullscreen UI");
let session=null,launching=false,reported=0,lastStatus="";
function report(message,error=false){
 const text=String(message);
 if(text===lastStatus&&!error)return;
 lastStatus=text;status.textContent=text;status.style.color=error?"#ffaaa7":"#a3ffbe";
 if(!menu.hidden)menuStatus.textContent=text;
}
function setModePressed(mode){
 for(const node of document.querySelectorAll("[data-mode]"))
  node.setAttribute("aria-pressed",String(node.dataset.mode===mode));
}
const friendly=n=>Number.isFinite(n)?Number(n).toFixed(1):"—";
function updateTelemetry(game,now){
 if(now-reported<180)return;reported=now;
 const pos=game.flight.position(),spd=Math.hypot(...game.flight.linear()),gpu=game.lastDraw?.gpu;
 telemetry.textContent=game.mode.toUpperCase()+" · "+friendly(spd)+" m/s · "+
  "Z "+friendly(pos[2])+" m · "+game.simulatedTicks+" ticks · "+game.rigidSteps+" rigid · "+
  (gpu?.drawCalls??"—")+" draws · backlog "+friendly(game.backlogMs)+" ms";
 setModePressed(game.mode);
 const arm=$("armButton");
 if(arm&&session?.input)arm.setAttribute("aria-pressed",String(session.input.arm));
}
async function preciseGeoLocation(){
 if(!navigator.geolocation)return null;
 return new Promise(resolve=>{
  navigator.geolocation.getCurrentPosition(
   position=>resolve({lon:position.coords.longitude,lat:position.coords.latitude}),
   ()=>resolve(null),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
 });
}
async function loadRealWorld(game){
 const origin=await preciseGeoLocation();
 if(!origin){report("Native game ready · GPS unavailable · real terrain only");return;}
 report("Loading real OSM buildings and streets…");
 try{
  const result=await fetchNativeOsm(origin);
  if(game.closed)return;
  const shown=await game.updateOsmFeatures(result);
  if(shown?.cancelled)return;
  report("Real OSM · "+result.buildings.length+" buildings · "+
    result.roads.length+" streets · "+shown.collision.prismCount+" Box3D colliders");
 }catch(error){
  if(!game.closed){console.warn("optional OSM source",error);
   report("World online · OSM offline (no synthetic city)");}
 }
}
async function launch(){
 if(launching||session)return;
 launching=true;startButton.disabled=true;startButton.textContent="STARTING";
 let game=null,input=null;
 try{
  report("Initializing original Erin Catto Box3D WebAssembly…");
  const b3=await Box3DFactory();
  const canvas=document.createElement("canvas");
  canvas.id="nativeCanvas";canvas.setAttribute("aria-label","SpawnCity WebGL2 game");
  canvas.tabIndex=0;viewport.append(canvas);
  report("Initializing one native GPU and original Flight Core…");
  game=new NativeGameRuntime(canvas,{
   b3,flightCoreFactory:FlightCoreFactory,
   onError:error=>{console.error("native game",error);report("Native engine halted: "+error.message,true);}
  });
  input=new NativeGameInput(game,{canvas});
  game.beforeFrame=()=>input.sample();
  game.afterFrame=(frame,now)=>updateTelemetry(game,now);
  for(const node of document.querySelectorAll("[data-mode]")){
   node.addEventListener("click",()=>{
    try{game.setMode(node.dataset.mode);input.sample();setModePressed(game.mode);}
    catch(error){report(error.message,true);}
   });
  }
  $("armButton")?.addEventListener("click",()=>{
   input.arm=!input.arm;input.sample();
   $("armButton").setAttribute("aria-pressed",String(input.arm));
  });
  $("cameraButton")?.addEventListener("click",()=>{
   const current=game.world.flightCameraMode??"follow";
   const next=current==="follow"?"fpv":current==="fpv"?"third":"follow";
   game.world.setFlightCameraMode(next);
   report("Camera "+next.toUpperCase());
  });
  $("fullscreenButton")?.addEventListener("click",async()=>{
   try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await viewport.requestFullscreen?.();
   }catch(error){report("Fullscreen not permitted on this browser");}
  });
  await game.start();
  session={game,input,canvas};
  menu.hidden=true;
  document.documentElement.dataset.engine="native-webgl2";
  viewport.dataset.renderer="native-webgl2-only";
  setModePressed("drone");
  report("Native WebGL2 · real 1 kHz Flight Core running");
  void loadRealWorld(game);
 }catch(error){
  console.error("native bootstrap",error);
  input?.dispose();await game?.dispose?.().catch(()=>{});
  viewport.querySelector("#nativeCanvas")?.remove();
  report("Start failed: "+error.message,true);
  startButton.textContent="RETRY";startButton.disabled=false;
 }finally{launching=false;}
}
startButton.disabled=false;startButton.addEventListener("click",launch);
document.addEventListener("visibilitychange",()=>{
 const game=session?.game;if(!game)return;
 if(document.hidden){game.stop();session.input.releaseInputs();}
 else if(!game.closed){void game.start().catch(e=>report("Resume failed: "+e.message,true));}
});
window.addEventListener("pagehide",()=>{
 if(!session)return;
 const {game,input}=session;session=null;input.dispose();void game.dispose();
});
