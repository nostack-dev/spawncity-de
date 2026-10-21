// Production-shaped browser bootstrap for one native WebGL2 game.
// Both WASM engines are compiled from this repository's pinned original
// sources. Presentation, input and OSM enter through the sealed engine only.
import Box3DFactory from "box3d.js/dist/box3d.inline.mjs";
import FlightCoreFactory from "../generated/flight_core.mjs";
import {NativeGameRuntime,NativeGameInput,fetchNativeOsm,NATIVE_DEMO_CITY} from "./native_engine.mjs";
import {installNativeWeapons} from "./native_weapons.mjs";
import {installNativeHandGrenade} from "./native_hand_grenade.mjs";
import {syncNativeViewmodel} from "./native_viewmodels.mjs";
import {installNativeVitals} from "./native_vitals.mjs";
import {installNativeWanted} from "./native_wanted.mjs";
import "./neon_ui_theme.mjs";
import "./mobile_gameplay_ui.mjs";
import "./immersive_soundscape.mjs";
import "./jetpack_audio.mjs";
import "./headshot_feedback.mjs";
import "./native_fire_audio.mjs";
import "./sniper_scope.mjs";
import "./native_ads.mjs";
import "./native_mode_overlay.mjs";
import "./world_options_menu.mjs";
import "./changelog_menu.mjs";
import "./share_button.mjs";
import "./thumb_layout.mjs";
import "./quit_confirm.mjs";
import "./settings_help.mjs";
// Production page modules without any renderer: rule votes, time-of-day sync,
// EMP button layout, player push, street voices, animal audio, feedback box.
import "./game_rules_sync.mjs";
import "./day_night_sync.mjs";
import "./emp_button_layout.mjs";
import "./player_push.mjs";
import "./street_voices.mjs";
import "./animal_audio.mjs";
import "./suggestion_box.mjs";
import "./gameplay_final_ui_dock.mjs";
import "./edge_hud_layout.mjs";
import "./drone_weapon_modes.mjs";
import "./mp_fun_hud.mjs";
import "./start_location.mjs";
import "./player_settings_sections.mjs";
import {mountPlayerControlSettings} from "./control_settings.mjs";
import {mountAudioSettings,loadAudioSettings,saveAudioSettings} from "./audio_settings.mjs";
import {installNativeModeOverlay} from "./native_mode_overlay.mjs";
import {buildingLaunchPointClear} from "./world_building_collision_physics.mjs";
import {installNativeHudMap,tickNativeHudMap,setNativeHudSources} from "./native_hud_map.mjs";
import {nativePeople} from "./native_city_life.mjs";
import {nativeCops} from "./native_police_ground.mjs";
import {installNativeCityLife,tickNativeCityLife} from "./native_city_life.mjs";
import {installNativePolice,tickNativePolice} from "./native_police_ground.mjs";
import {installNativeWorldLife,tickNativeWorldLife} from "./native_world_life.mjs";
import {installNativeThreats,tickNativeThreats} from "./native_threats.mjs";
import {installNativePlaces,tickNativePlaces} from "./native_places.mjs";
import {installNativeSession,tickNativeSession} from "./native_session.mjs";
import {installGpsLive} from "./native_gps_live.mjs";
import {installSpeedLines} from "./native_speed_lines.mjs";
import {installNativeCameraGuard} from "./native_camera_guard.mjs";
import {installNativeSandbox,tickNativeSandbox} from "./native_sandbox.mjs";
import {installNativeWorldImpacts,installNativeTrees,tickNativeWorldImpacts} from "./native_world_impacts.mjs";
import {nativeOsmProjector} from "./native_osm_projector.mjs";
import {installNativeCombat,tickNativeCombat} from "./native_combat.mjs";
import {installNativeVehicleEntry,tickNativeVehicleEntry} from "./native_vehicle_entry.mjs";
import {applyNativeDayNight} from "./native_day_night.mjs";
import {installNativeGroundAreas} from "./native_ground_areas.mjs";
import {buildNativeTrainingSnapshot,installNativeTrainingProps,removeNativeTrainingProps,NATIVE_TRAINING_ORIGIN} from "./native_training_world.mjs";
import {installNativeJetHud,tickNativeJetHud} from "./native_jet_hud.mjs";
import {HybridMotorSound} from "./motor_sound.mjs";
export const NATIVE_BROWSER_BOOT_VERSION="single-repo-no-three-full-game-boot-v1";
const $=id=>document.getElementById(id);
const viewport=$("viewport"),startButton=$("gameMenuStart"),menu=$("gameMenu"),
 status=$("status"),menuStatus=$("gameMenuStatus"),telemetry=$("telemetry");
let settings=null;
try{
  settings=mountPlayerControlSettings({parent:document.getElementById("welcome"),buttonText:"SETTINGS"});
  mountAudioSettings({dialog:settings.dialog});
}catch(error){console.warn("settings",error);}
if(!viewport||!startButton||!menu||!status)throw Error("SpawnCity native boot requires its real fullscreen UI");
let session=null,launching=false,prepared=false,starting=false,booting=true,reported=0,lastStatus="";
let activeOsm=null,osmEpoch=0;
function report(message,error=false){
 const text=String(message);
 if(text===lastStatus&&!error)return;
 lastStatus=text;status.textContent=text;status.style.color=error?"#ffaaa7":"#a3ffbe";
 if(!menu.hidden&&!starting&&!booting)menuStatus.textContent=text;
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
let cachedFix=null,permissionState="unknown",asking=null;
function platform(){
 const ua=navigator.userAgent||"";
 if(/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1))return "ios";
 if(/Android/.test(ua))return "android";
 return "desktop";
}
function deniedHint(){
 const where={
  ios:"Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari → Beim Verwenden der App",
  android:"Schloss in der Adresszeile → Berechtigungen → Standort → Zulassen",
  desktop:"Schloss links in der Adresszeile → Standort → Zulassen"
 }[platform()];
 return "Standort blockiert. "+where;
}
function gpsOnce(options){
 return new Promise(resolve=>{
  if(!navigator.geolocation){resolve({fix:null,error:Error("no geolocation")});return;}
  try{navigator.geolocation.getCurrentPosition(
   position=>resolve({fix:{lon:position.coords.longitude,lat:position.coords.latitude,accuracy:position.coords.accuracy},error:null}),
   error=>resolve({fix:null,error}),options);}
  catch(error){resolve({fix:null,error});}
 });
}
async function readPermission(){
 try{
  const status=await navigator.permissions?.query?.({name:"geolocation"});
  if(!status)return permissionState;
  permissionState=status.state;
  status.onchange=()=>{permissionState=status.state;if(status.state==="granted"&&!cachedFix)void requestLocation({reason:"permission-granted"});paintPermission();};
  return status.state;
 }catch{return permissionState;}
}
function paintPermission(){
 const button=document.getElementById("locationPermission");
 if(!button)return;
 const missing=permissionState!=="granted"&&!cachedFix&&!globalThis.__arondightStartPlace?.get?.();
 button.hidden=!missing;
 button.textContent=permissionState==="denied"?"STANDORT ERLAUBEN":"STANDORT ANFRAGEN";
}
function ensurePermissionButton(){
 if(document.getElementById("locationPermission"))return;
 const host=document.getElementById("welcome");if(!host)return;
 const button=document.createElement("button");
 button.id="locationPermission";button.type="button";button.hidden=true;
 button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();void requestLocation({reason:"button",force:true});});
 host.appendChild(button);
 const style=document.createElement("style");
 style.textContent="#locationPermission{display:block;margin:10px auto 0;min-width:min(64vw,300px);padding:10px 16px;border-radius:12px;border:1px solid #7fd3ff;background:#123049;color:#e7f4ff;font:800 12px/1 system-ui;letter-spacing:.08em;cursor:pointer}#locationPermission[hidden]{display:none}";
 document.head.appendChild(style);
}
// Ask immediately when the page opens and again from a tap if the browser
// (iOS) only shows the system dialog inside a user gesture.
async function requestLocation({reason="initial",force=false}={}){
 if(cachedFix&&!force)return cachedFix;
 if(asking)return asking;
 // Fire the system dialog before any await. iOS only shows it inside a gesture.
 const pending=permissionState==="denied"&&!force?null:gpsOnce({enableHighAccuracy:true,timeout:12000,maximumAge:0});
 asking=(async()=>{
  await readPermission();
  if(permissionState==="denied"&&!force){setMenuStatus(deniedHint());paintPermission();return null;}
  setMenuStatus(reason==="initial"?"STANDORT WIRD ANGEFRAGT":"STANDORT ERLAUBEN");
  const precise=pending?await pending:await gpsOnce({enableHighAccuracy:true,timeout:12000,maximumAge:0});
  if(precise.fix){cachedFix=precise.fix;permissionState="granted";setMenuStatus("STANDORT GEFUNDEN");paintPermission();return cachedFix;}
  if(precise.error?.code===1){permissionState="denied";setMenuStatus(deniedHint());paintPermission();return null;}
  const coarse=await gpsOnce({enableHighAccuracy:false,timeout:8000,maximumAge:60000});
  if(coarse.fix){cachedFix=coarse.fix;permissionState="granted";setMenuStatus("STANDORT GEFUNDEN");paintPermission();return cachedFix;}
  if(coarse.error?.code===1)permissionState="denied";
  setMenuStatus(permissionState==="denied"?deniedHint():"Kein GPS-Signal · START versucht es erneut");
  paintPermission();
  return null;
 })();
 try{return await asking;}finally{asking=null;}
}
ensurePermissionButton();
void requestLocation({reason:"initial"});
addEventListener("pointerdown",()=>{if(!cachedFix&&permissionState!=="denied")void requestLocation({reason:"gesture"});},{capture:true,once:true});
async function resolveStartOrigin(){
 // Same contract as production: a place picked this session wins, otherwise
 // the player's GPS position. Konstanz is only the labelled fallback.
 const chosen=globalThis.__arondightStartPlace?.fix?.();
 if(chosen?.coords){
  return {origin:{lon:chosen.coords.longitude,lat:chosen.coords.latitude},label:globalThis.__arondightStartPlace.get()?.name||"chosen place",source:"place"};
 }
 // Blocked location never delays START (production starts at once); only an
 // undecided prompt waits for the player's answer.
 if(!cachedFix)await readPermission();
 const fix=cachedFix||(permissionState==="denied"?null:await requestLocation({reason:"start",force:true}));
 if(fix)return {origin:fix,label:"your GPS location",source:"gps"};
 // Production: no GPS fix and no chosen place starts the training world.
 report(permissionState==="denied"?deniedHint():"GPS unavailable · training world");
 return {origin:NATIVE_TRAINING_ORIGIN,label:"Training",source:"training"};
}
// World bridge for GPS live (production __arondightRealWorld contract):
// active / loading / origin / projectLngLat and activate() at a GPS fix.
let worldOrigin=null,worldSource="",worldLoading=false,forcedOrigin=null;
globalThis.__nativeWorldBridge={
 get active(){return Boolean(worldOrigin)&&worldSource!=="training";},
 get loading(){return worldLoading;},
 get originLon(){return worldOrigin?.lon;},get originLat(){return worldOrigin?.lat;},
 projectLngLat(lon,lat){return worldOrigin?nativeOsmProjector(worldOrigin).project(lon,lat):null;},
 async activate({coords}={}){if(!session?.game||!coords)return false;forcedOrigin={lon:coords.longitude,lat:coords.latitude};cachedFix=forcedOrigin;return loadRealWorld(session.game);},
 deactivate(){worldOrigin=null;}
};
async function loadRealWorld(game){
 const epoch=++osmEpoch;
 activeOsm?.abort();
 const controller=new AbortController();activeOsm=controller;
 worldLoading=true;
 const resolved=forcedOrigin?{origin:forcedOrigin,label:"your GPS location",source:"gps"}:await resolveStartOrigin();
 forcedOrigin=null;
 if(game.closed)return false;
 const origin=resolved.origin,label=resolved.label;
 if(game.closed||epoch!==osmEpoch)return;
 report("Loading "+label+" · real OpenStreetMap buildings and roads…");
 try{
  const training=resolved.source==="training";
  const demo=!training&&origin.lon===NATIVE_DEMO_CITY.origin.lon&&origin.lat===NATIVE_DEMO_CITY.origin.lat;
  const result=training?buildNativeTrainingSnapshot(origin):await fetchNativeOsm(origin,{
   signal:controller.signal,
   snapshotUrl:demo?"./osm/demo-konstanz.json":null
  });
  if(training)installNativeTrainingProps(game);else{removeNativeTrainingProps(game);const v=document.getElementById("viewport");if(v)v.dataset.worldMode="real";}
  if(game.closed||epoch!==osmEpoch)return;
  const shown=await game.updateOsmFeatures(result);
  if(shown?.cancelled||epoch!==osmEpoch)return false;
  worldOrigin={lon:Number(origin.lon),lat:Number(origin.lat)};worldSource=resolved.source;
  const life=installNativeCityLife(game,result);
  installNativeHudMap(game,result);
  setNativeHudSources({people:nativePeople,cops:nativeCops});
  installNativePolice();
  try{installNativeGroundAreas(game,result);}catch(error){console.warn("ground areas",error);}
  try{installNativeTrees(result);}catch(error){console.warn("trees",error);}
  const life2=installNativeWorldLife(game,result);
  installNativeThreats();
  installNativePlaces(game,result);
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
    (life?.people||0)+" people · "+(life?.cars||0)+" cars · "+(life?.lamps||0)+" lamps");
  return true;
 }catch(error){
  if(!game.closed&&epoch===osmEpoch&&!controller.signal.aborted){
   // A failed external OSM service must be visible and retryable. Never
   // silently populate buildings/roads from random synthetic fixtures.
   console.warn("Native OpenStreetMap unavailable",error);
   report("OSM connection failed · tap CITY to retry real map",true);
  }
  return false;
 }finally{if(epoch===osmEpoch){activeOsm=null;worldLoading=false;}}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function startupMode(){try{const mode=new URLSearchParams(location.search).get("start");return mode==="drone"?"drone":"foot";}catch{return"foot";}}
function holdMenus(ms=8000){const until=performance.now()+ms;globalThis.__arondightQuietUnlockUntil=until;globalThis.__arondightHadLockUntil=until;}
function menuCover(on){viewport?.toggleAttribute("inert",Boolean(on));document.getElementById("toolbar")?.toggleAttribute("inert",Boolean(on));}
function setMenuStatus(text){if(menuStatus)menuStatus.textContent=text;}
function applyStartupPlayerMode(game){
 const mode=startupMode();
 try{game.setMode(mode);}catch(error){report(error.message,true);}
 if(mode==="foot")globalThis.__arondightFootWeapons?.setMode?.("glock");
 game.world?.setFlightCameraMode?.("fpv");
 const camera=$("cameraButton");if(camera)camera.textContent="FPV";
 setModePressed(game.mode);
 if(viewport){viewport.dataset.autoFlightStart=mode==="foot"?"foot":"fpv";viewport.dataset.autoStartupPlayerMode=String(game.mode||mode);viewport.dataset.autoStartupFootWeapon="glock";viewport.dataset.autoStartupContract="foot-pistol-fresh-v1";}
}
function showMenu(){
 starting=false;
 holdMenus(2000);
 try{document.exitPointerLock?.();}catch{}
 const worldPanel=document.getElementById("worldOptionsPanel"),log=document.getElementById("changelogPanel");
 if(worldPanel)worldPanel.hidden=true;if(log)log.hidden=true;
 try{if(settings?.dialog?.open)settings.dialog.close();}catch{}
 document.body.classList.remove("solo-flight");
 if(menu){menu.classList.remove("gm-leaving");menu.hidden=false;}
 menuCover(true);
 if(startButton){startButton.disabled=!prepared;startButton.textContent=prepared?"START":"LOADING";}
 setMenuStatus(prepared?"READY":"PREPARING");
}
async function prepareEngine(){
 if(launching||session)return;
 launching=true;startButton.disabled=true;startButton.textContent="LOADING";setMenuStatus("PREPARING");
 menuCover(true);
 let game=null,input=null;
 try{
  report("Initializing original Erin Catto Box3D WebAssembly…");
  const b3=await Box3DFactory();
  const canvas=document.createElement("canvas");
  canvas.id="nativeCanvas";canvas.setAttribute("aria-label","SpawnCity WebGL2 game");
  canvas.tabIndex=-1;viewport.append(canvas);
  canvas.addEventListener("pointerdown",()=>{if(menu&&!menu.hidden)return;canvas.focus();globalThis.__arondightHadLockUntil=performance.now()+1500;if(document.pointerLockElement!==viewport)viewport.requestPointerLock?.();});
  report("Initializing one native GPU and original Flight Core…");
  game=new NativeGameRuntime(canvas,{
   b3,flightCoreFactory:FlightCoreFactory,
   onError:error=>{console.error("native game",error);if(!game.running)report("Native engine halted: "+error.message,true);}
  });
  input=new NativeGameInput(game,{canvas});
  installNativeVehicleEntry(game,{input});
  installNativeJetHud(game,{input});
  installNativeSession(game);
  installGpsLive(game);
  installSpeedLines(game);
  installNativeCameraGuard(game);
  installNativeSandbox(game);
  installNativeWorldImpacts(game);
  installNativeCombat();
  try{installNativeModeOverlay();}catch(error){console.warn("overlay",error);}
  const weapons=installNativeWeapons(game,{armed:()=>input.arm});
  installNativeHandGrenade(game);
  for(const button of document.querySelectorAll("#mobileGameplayDock button,#mobileGameplayMode,#mobileGameplayReset,#mobileGameplayMultiplayer,#gameExitButton,#toolbar button"))
   button.tabIndex=-1;
  const vitals=installNativeVitals(game);
  const wanted=installNativeWanted(game);
  game.beforeFrame=()=>{applyNativeDayNight(game.world?.renderer);return input.sample();};
  const motor=new HybridMotorSound(viewport);
  addEventListener("pointerdown",()=>motor.ensure(),{once:true});
  game.afterFrame=(frame,now)=>{weapons.tick(now);tickNativeSandbox(now);tickNativeWorldImpacts(now);tickNativeVehicleEntry();tickNativeJetHud();syncNativeViewmodel(game);vitals.sync(now);tickNativeCityLife(game,now);tickNativePolice(game,now);tickNativeWorldLife(game,now);tickNativeThreats(game,now);tickNativePlaces(game,now);tickNativeSession(game);tickNativeHudMap(game);tickNativeCombat(game);const flight=game.flight;motor.update({motorOmega:flight?.motorOmega||[0,0,0,0],motorTorque:flight?.motorTorque||[0,0,0,0],propTorque:flight?.propTorque||[0,0,0,0],position:()=>flight?.position?.()||[0,0,0],p:flight?.p||{propD:.127}},{x:0,y:0,z:0});updateTelemetry(game,now);};
  for(const button of document.querySelectorAll("[data-drone-weapon]")){
   button.addEventListener("click",()=>{
    globalThis.__arondightDroneWeapons?.setMode?.(button.dataset.droneWeapon);
    for(const node of document.querySelectorAll("[data-drone-weapon]"))
     node.setAttribute("aria-pressed",String(node===button));
   });
  }
  for(const node of document.querySelectorAll("[data-mode]")){
   node.addEventListener("click",()=>{
    try{game.setMode(node.dataset.mode);input.sample();setModePressed(game.mode);node.blur();}
    catch(error){report(error.message,true);}
   });
  }
  $("armButton")?.addEventListener("click",()=>{
   input.arm=!input.arm;input.sample();
   $("armButton").setAttribute("aria-pressed",String(input.arm));
  });
  $("cityButton")?.addEventListener("click",()=>{
   if(!session||session.game.closed)return;
   void loadRealWorld(game);
  });
  $("cameraButton")?.addEventListener("click",()=>{
   const current=game.world.flightCameraMode??"follow";
   const next=current==="follow"?"fpv":current==="fpv"?"third":"follow";
   game.world.setFlightCameraMode(next);
   $("cameraButton").textContent=next==="follow"?"FOLLOW":next==="fpv"?"FPV":"THIRD";
   report("Camera "+next.toUpperCase());
  });
  let exit=$("soloExit");
  if(!exit){exit=document.createElement("button");exit.id="soloExit";exit.type="button";exit.hidden=true;document.body.appendChild(exit);}
  exit.addEventListener("click",()=>showMenu());
  $("soloReset")?.addEventListener("click",()=>{
   globalThis.__arondightPlayerDamageModel?.reset?.();
   globalThis.__arondightDroneDamageModel?.reset?.();
   wanted.clear("reset");
   applyStartupPlayerMode(game);
   report("Reset");
  });
  $("fullscreenButton")?.addEventListener("click",async()=>{
   try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await viewport.requestFullscreen?.();
   }catch(error){report("Fullscreen not permitted on this browser");}
  });
  await game.start();
  session={game,input,canvas,worldLoaded:false,placeKey:null,weapons};
  globalThis.__arondightApplyStartMode=()=>applyStartupPlayerMode(game);
  applyStartupPlayerMode(game);
  if(navigator.webdriver)window.__spawncityNativeGame=game; // automation only: gameplay parity checks
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
  prepared=true;booting=false;
  $("armButton")?.setAttribute("aria-pressed","true");
  report("Native WebGL2 · real 1 kHz Flight Core running");
  startButton.disabled=false;startButton.textContent="START";setMenuStatus("READY");
 }catch(error){
  console.error("native bootstrap",error);
  input?.dispose();await game?.dispose?.().catch(()=>{});
  viewport.querySelector("#nativeCanvas")?.remove();
  session=null;prepared=false;booting=false;
  report("Start failed: "+(error?.message||error),true);
  startButton.textContent="RETRY";startButton.disabled=false;
  startButton.onclick=()=>location.reload();
 }finally{launching=false;}
}
async function startGame(){
 if(starting||launching)return;
 if(!prepared||!session)return;
 if(document.body.classList.contains("solo-flight")&&menu?.hidden)return;
 starting=true;
 holdMenus(8000);
 startButton.disabled=true;startButton.textContent="LOADING";
 const placeKey=JSON.stringify(globalThis.__arondightStartPlace?.get?.()||null);
 try{
  if(!session.worldLoaded||placeKey!==session.placeKey){
   setMenuStatus("LOCATING");
   const loaded=await loadRealWorld(session.game);
   if(loaded){session.worldLoaded=true;session.placeKey=placeKey;}
  }
  setMenuStatus("PREPARING");
  applyStartupPlayerMode(session.game);
  session.input?.sample?.();
  if(menu&&!menu.hidden){menu.classList.add("gm-leaving");await wait(350);}
  if(menu){menu.hidden=true;menu.classList.remove("gm-leaving");}
  menuCover(false);
  document.body.classList.add("solo-flight");
  document.documentElement.dataset.engine="native-webgl2";
  viewport.dataset.renderer="native-webgl2-only";
  session.canvas?.focus?.();
  startButton.disabled=false;startButton.textContent="START";
 }catch(error){
  console.warn("game startup preparation continued after non-fatal failure",error);
  setMenuStatus("STARTING");
  if(menu){menu.hidden=true;menu.classList.remove("gm-leaving");}
  menuCover(false);
  document.body.classList.add("solo-flight");
  document.documentElement.dataset.engine="native-webgl2";
  startButton.disabled=false;startButton.textContent="START";
 }finally{starting=false;}
}
// Music / effects toggles and their in-game dock are the production inline
// script in native_game.html (same audio settings key and change event).
startButton.addEventListener("click",()=>{if(startButton.textContent==="RETRY"){location.reload();return;}void startGame();});
addEventListener("keydown",event=>{
  if(event.metaKey||event.ctrlKey||event.altKey)return;
  const target=event.target;
  const typing=target instanceof Element&&target.closest("input,textarea,select,[contenteditable=true]");
  if(typing)return;
  const modal=document.querySelector("dialog[open],#quitConfirmDialog");
  if(modal&&target instanceof Node&&modal.contains(target))return;
  const title=menu&&!menu.hidden;
  if(title){
   const panel=document.querySelector("#worldOptionsPanel:not([hidden]),#changelogPanel:not([hidden])");
   if(panel)return;
   if(target instanceof Element&&target.closest("#toolbar,#mobileGameplayDock,#gameExitButton,#viewport")){event.preventDefault();return;}
   if(!event.repeat&&(event.code==="Enter"||event.code==="Space")&&(target===document.body||target===startButton)&&prepared&&!starting){event.preventDefault();void startGame();}
   return;
  }
  if(target instanceof Element&&target.closest("button,a,[role=button],#toolbar,#mobileGameplayDock,#gameExitButton")){
   if(event.code!=="Escape"&&event.code!=="Tab"){event.preventDefault();target.blur?.();session?.canvas?.focus?.();}
  }
},true);
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
menuCover(true);
void prepareEngine();
