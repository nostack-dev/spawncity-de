// Multiplayer, GPS live and facade marks on the native page.
// The session is the live LanVsFinder. Peers use the live pose timeline.
import {LanVsFinder} from "./lan_vs.mjs";
import {VsPoseTimeline} from "./vs_pose_sync.mjs";
import {NativePeerVisuals} from "./native_peer_visuals.mjs";
import {fromTRS} from "./native_render_math.mjs";

const EARTH=6378137;
let finder=null,timeline=null,peers=null,gps=null,marks=[],drawn={};
function puck(){
  const p=[],n=[],c=[];
  const add=(a,b,d)=>{for(const q of [a,b,d]){p.push(...q);n.push(0,0,1);c.push(.26,.52,.96);}};
  add([0,.4,1.6],[.25,0,.2],[-.25,0,.2]);
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
const PUCK=puck(),CRACK={positions:new Float32Array([-.2,0,.01,.2,0,.01,0,.02,.4]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),colors:new Float32Array([.9,.95,1,.9,.95,1,.9,.95,1])};
function paint(renderer,id,geo,data){
  if(!data.length){if(drawn[id]){renderer.remove(id);drawn[id]=false;}return;}
  const transforms=new Float32Array(data);
  if(drawn[id])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawn[id]=true;}
}
export function installNativeSession(game){
  timeline=new VsPoseTimeline();
  peers=new NativePeerVisuals(game.world.renderer,{timeline,connected:()=>Boolean(finder?.active),mode:()=>"drone"});
  const button=document.createElement("button");
  button.type="button";button.id="gameMenuShare";button.textContent="MULTIPLAYER";
  document.getElementById("gameMenuStart")?.after(button);
  button.addEventListener("click",async()=>{
    if(finder)return;
    finder=new LanVsFinder({onPose:(pose)=>timeline.push(pose)});
    try{await finder.start(["spawncity-native"]);button.textContent="IN ROOM";}
    catch(error){button.textContent="OFFLINE";console.warn("native session",error);}
  });
  if(navigator.geolocation){
    gps={x:0,y:0,on:false};
    navigator.geolocation.watchPosition(pos=>{
      const o=game.world?.origin||{lon:9.17442,lat:47.66022};
      gps.x=(pos.coords.longitude-o.lon)*Math.PI/180*EARTH*Math.cos(o.lat*Math.PI/180);
      gps.y=(pos.coords.latitude-o.lat)*Math.PI/180*EARTH;
      gps.on=true;gps.heading=pos.coords.heading||0;
      document.body.classList.add("gps-live");
    },()=>{},{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
  }
  globalThis.__arondightGpsLiveApi={start(){return Boolean(gps);},stop(){gps=null;}};
}
export function tickNativeSession(game){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const pose=game.flight?.position?.();
  if(finder&&pose)finder.setPose({p:pose,q:[0,0,0,1],v:game.flight.linear?.()||[0,0,0],t:performance.now()});
  peers?.update();
  if(gps?.on)paint(renderer,"session/gps",PUCK,[...fromTRS([gps.x,gps.y,0],[0,0,Math.sin((gps.heading||0)*.5),Math.cos((gps.heading||0)*.5)],[1,1,1])]);
  paint(renderer,"session/facade",CRACK,marks.slice(-30).flat());
}
export function markFacade(point){
  if(!point)return;
  marks.push(fromTRS(point,[0,0,0,1],[1,1,1]));
  if(marks.length>30)marks.shift();
}
