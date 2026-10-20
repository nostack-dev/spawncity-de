// Production-shaped browser bootstrap for one native WebGL2 game.
// Both WASM engines are compiled from this repository's pinned original
// sources. Presentation, input and OSM enter through the sealed engine only.
import Box3DFactory from "box3d.js/dist/box3d.inline.mjs";
import FlightCoreFactory from "../generated/flight_core.mjs";
import {NativeGameRuntime,NativeGameInput,fetchNativeOsm,NATIVE_DEMO_CITY} from "./native_engine.mjs";
import {installNativeWeapons} from "./native_weapons.mjs";
import {syncNativeViewmodel} from "./native_viewmodels.mjs";
import {installNativeVitals} from "./native_vitals.mjs";
import {installNativeWanted} from "./native_wanted.mjs";
import {openQuitConfirm} from "./quit_confirm.mjs";
import "./neon_ui_theme.mjs";
import "./mobile_gameplay_ui.mjs";
import "./immersive_soundscape.mjs";
import "./native_fire_audio.mjs";
import "./sniper_scope.mjs";
import "./native_ads.mjs";
import "./native_mode_overlay.mjs";
import "./world_options_menu.mjs";
import "./changelog_menu.mjs";
import "./player_settings_sections.mjs";
import {mountPlayerControlSettings} from "./control_settings.mjs";
import {mountAudioSettings} from "./audio_settings.mjs";
import {installNativeModeOverlay} from "./native_mode_overlay.mjs";
import {buildingLaunchPointClear} from "./world_building_collision_physics.mjs";
import {installNativeCityLife,tickNativeCityLife} from "./native_city_life.mjs";
export const NATIVE_BROWSER_BOOT_VERSION="single-repo-no-three-full-game-boot-v1";
const $=id=>document.getElementById(id);
const viewport=$("viewport"),startButton=$("gameMenuStart"),menu=$("gameMenu"),
 status=$("status"),menuStatus=$("gameMenuStatus"),telemetry=$("telemetry");
const settings=mountPlayerControlSettings({parent:menu,buttonText:"SETTINGS"});
mountAudioSettings({dialog:settings.dialog});
if(!viewport||!startButton||!menu||!status)throw Error("SpawnCity native boot requires its real fullscreen UI");
let session=null,launching=false,reported=0,lastStatus="";
let activeOsm=null,osmEpoch=0;
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
 // Telemetry belongs to the selected actor, not the idle drone at 0.1 m.
 const actorId={foot:"player-foot",car:"player-car",jet:"player-jet"}[game.mode];
 const actor=actorId?game.rigids.pose(actorId):null;
 const pos=actor?.position??game.flight.position();
 const velocity=actor?.velocity??game.flight.linear();
 const spd=Math.hypot(...velocity),gpu=game.lastDraw?.gpu;
 telemetry.textContent=game.mode.toUpperCase()+" · "+(session?.weapons?.weapon||"")+" · "+
  friendly(spd)+" m/s · Z "+friendly(pos[2])+" m · "+(session?.weapons?.fps??"—")+" fps · "+
  (gpu?.drawCalls??"—")+" draws · backlog "+friendly(game.backlogMs)+" ms";
 const stateLabel=$("soloState"),altLabel=$("soloAlt");
 if(stateLabel)stateLabel.textContent=(session?.input?.arm?"ARMED":"DISARMED")+" · "+game.mode.toUpperCase();
 if(altLabel)altLabel.textContent=friendly(spd)+" m/s · Z "+friendly(pos[2])+" m";
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
async function loadRealWorld(game,{source="demo"}={}){
 const epoch=++osmEpoch;
 activeOsm?.abort();
 const controller=new AbortController();activeOsm=controller;
 // A non-GPS visitor must get a REAL, playable city, not a flat empty
 // render that can still pass a GPU draw-count-only smoke test.
 // The predefined demo is explicitly labelled; it NEVER claims to be near
 // the player. Geolocation is requested ONLY if "gps" was chosen on Start.
 let origin=NATIVE_DEMO_CITY.origin;
 let label=NATIVE_DEMO_CITY.name;
 if(source==="gps"){
  const fix=await preciseGeoLocation();
  if(!fix){
   if(game.closed)return;
   report("GPS denied · switching to real Konstanz demo");
  }else{
   origin=fix;label="your GPS location";
  }
 }
 if(game.closed||epoch!==osmEpoch)return;
 report("Loading "+label+" · real OpenStreetMap buildings and roads…");
 try{
  const demo=origin.lon===NATIVE_DEMO_CITY.origin.lon&&origin.lat===NATIVE_DEMO_CITY.origin.lat;
  const result=await fetchNativeOsm(origin,{
   signal:controller.signal,
   snapshotUrl:demo?"./osm/demo-konstanz.json":null
  });
  if(game.closed||epoch!==osmEpoch)return;
  const shown=await game.updateOsmFeatures(result);
  if(shown?.cancelled||epoch!==osmEpoch)return;
  const life=installNativeCityLife(game,result);
  // Authoritative Box3D has chosen the real mapped footpath; give the ONE
  // existing desktop/touch/gamepad input owner the same initial heading.
  // Never override a user's own pointer/mouse look after they have turned.
  const street=shown.collision?.spawnClearance?.streetFoot;
  if(street&&session?.game===game&&Math.abs(session.input.yaw)<.001){
   session.input.yaw=street.yaw;session.input.pitch=-.095;
  }
  if(!shown?.collision?.prismCount||!result.buildings.length)
   throw Error("OSM produced no collision-safe city buildings");
  report(label+" · "+result.buildings.length+" real OSM buildings · "+
    result.roads.length+" roads · "+shown.collision.prismCount+" Box3D colliders · "+
    (life?.people||0)+" people · "+(life?.cars||0)+" cars");
 }catch(error){
  if(!game.closed&&epoch===osmEpoch&&!controller.signal.aborted){
   // A failed external OSM service must be visible and retryable. Never
   // silently populate buildings/roads from random synthetic fixtures.
   console.warn("Native OpenStreetMap unavailable",error);
   report("OSM connection failed · tap CITY to retry real map",true);
  }
 }finally{if(epoch===osmEpoch)activeOsm=null;}
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
  installNativeModeOverlay();
  const actions=document.getElementById("soloTopbarActions");
  if(actions){
    const open=document.createElement("button");
    open.type="button";open.textContent="SETTINGS";
    open.addEventListener("click",()=>settings.dialog.showModal());
    actions.appendChild(open);
  }
  const weapons=installNativeWeapons(game,{armed:()=>input.arm});
  const vitals=installNativeVitals(game);
  const wanted=installNativeWanted(game);
  game.beforeFrame=()=>input.sample();
  game.afterFrame=(frame,now)=>{weapons.tick(now);syncNativeViewmodel(game);vitals.sync(now);tickNativeCityLife(game,now);updateTelemetry(game,now);};
  for(const button of document.querySelectorAll("[data-drone-weapon]")){
   button.addEventListener("click",()=>{
    globalThis.__arondightDroneWeapons?.setMode?.(button.dataset.droneWeapon);
    for(const node of document.querySelectorAll("[data-drone-weapon]"))
     node.setAttribute("aria-pressed",String(node===button));
   });
  }
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
  $("cityButton")?.addEventListener("click",()=>{
   if(!session||session.game.closed)return;
   void loadRealWorld(game,{source:session.worldSource});
  });
  $("cameraButton")?.addEventListener("click",()=>{
   const current=game.world.flightCameraMode??"follow";
   const next=current==="follow"?"fpv":current==="fpv"?"third":"follow";
   game.world.setFlightCameraMode(next);
   $("cameraButton").textContent=next==="follow"?"FOLLOW":next==="fpv"?"FPV":"THIRD";
   report("Camera "+next.toUpperCase());
  });
  $("soloExit")?.addEventListener("click",event=>{
   if(event.isTrusted){openQuitConfirm();return;}
   location.reload();
  });
  $("soloReset")?.addEventListener("click",()=>{
   globalThis.__arondightPlayerDamageModel?.reset?.();
   globalThis.__arondightDroneDamageModel?.reset?.();
   wanted.clear("reset");
   report("Reset");
  });
  addEventListener("keydown",event=>{if(event.code==="Escape"&&!event.repeat)openQuitConfirm();});
  $("fullscreenButton")?.addEventListener("click",async()=>{
   try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await viewport.requestFullscreen?.();
   }catch(error){report("Fullscreen not permitted on this browser");}
  });
  await game.start();
  const worldSource=$("worldSource")?.value==="gps"?"gps":"demo";
  session={game,input,canvas,worldSource,weapons};
  // Chromium-only diagnostic snapshot for *rendered* scene validation.
  // Nothing is exposed to users; test observations come from actual
  // Box3D actors and WebGL2 draw state, never from fabricated fixtures.
  if(navigator.webdriver)window.__spawncityNativeProbe=()=>{
   const world=game.world,camera=world.camera;
   const car=game.rigids.pose("player-car");
   const foot=game.rigids.pose("player-foot");
   const terrain=world.terrain;
   return {
    mode:game.mode,flightZ:game.flight.position()[2],
    carPosition:car?.position,carVelocity:car?.velocity,
    footPosition:foot?.position,
    camera:camera?{eye:[...camera.eye],target:[...camera.target],up:[...camera.up],
      fov:camera.fov,near:camera.near,far:camera.far}:null,
    terrainChunks:terrain.live.size,terrainStats:terrain.stats,
    terrainHeightAtTarget:camera?terrain.heightAt(camera.target[0],camera.target[1]):null,
    cityStats:world.city.lastStats,roadSegments:world.roads.live.size,
    buildingColliders:game.lastOsmCollision?.prismCount??0,
    spawnClearance:game.lastOsmCollision?.spawnClearance??null,
    carSpawnClear:game.lastOsmCollision?buildingLaunchPointClear(
      game.rigids.buildingSnapshot,car?.position?.slice(0,2),{clearanceM:2.6}):null,
    footSpawnClear:game.lastOsmCollision?buildingLaunchPointClear(
      game.rigids.buildingSnapshot,foot?.position?.slice(0,2),{clearanceM:.95}):null,
    gpu:world.renderer.stats,
    meshCount:world.renderer.meshes.size,
    meshClasses:[...world.renderer.meshes.keys()].reduce((out,k)=>{
      const type=k.split("/")[0];out[type]=(out[type]??0)+1;return out;
    },{}),
    backlogMs:game.backlogMs,rigidSteps:game.rigidSteps
   };
  };
  menu.hidden=true;
  document.body.classList.add("solo-flight");
  document.documentElement.dataset.engine="native-webgl2";
  viewport.dataset.renderer="native-webgl2-only";
  setModePressed("drone");
  report("Native WebGL2 · real 1 kHz Flight Core running");
  void loadRealWorld(game,{source:worldSource});
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
 activeOsm?.abort();osmEpoch++;
 if(!session)return;
 const {game,input,weapons}=session;session=null;weapons?.dispose();input.dispose();void game.dispose();
});
