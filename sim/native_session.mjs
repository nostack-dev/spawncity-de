// Multiplayer, GPS live and facade marks on the native page.
// The session is the live LanVsFinder. Peers use the live pose timeline.
import {LanVsFinder} from "./lan_vs.mjs";
import {VsPoseTimeline} from "./vs_pose_sync.mjs";
import {NativePeerVisuals} from "./native_peer_visuals.mjs";
import {fromTRS} from "./native_render_math.mjs";

const EARTH=6378137;
let finder=null,timeline=null,peers=null,marks=[],drawn={};
function puck(){
  const p=[],n=[],c=[];
  const add=(a,b,d)=>{for(const q of [a,b,d]){p.push(...q);n.push(0,0,1);c.push(.26,.52,.96);}};
  add([0,.4,1.6],[.25,0,.2],[-.25,0,.2]);
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
const PUCK=puck(),CRACK={positions:new Float32Array([-.2,0,.01,.2,0,.01,0,.02,.4]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),colors:new Float32Array([.9,.95,1,.9,.95,1,.9,.95,1])};
function paint(renderer,id,geo,data){
  if(!data.length){if(drawn[id]){renderer.remove(id);drawn[id]=false;}return;}
  const transforms=new Float32Array(data.length*(data[0]?.length===16?16:1));
  if(data[0]?.length===16){for(let i=0;i<data.length;i++)transforms.set(data[i],i*16);}
  else transforms.set(data);
  if(drawn[id])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawn[id]=true;}
}
export function installNativeSession(game){
  timeline=new VsPoseTimeline();
  peers=new NativePeerVisuals(game.world.renderer,{timeline,connected:()=>Boolean(finder?.active),mode:()=>"drone"});
  // Production has no MULTIPLAYER entry on the title screen: the in-game MULTI
  // button (mobile_gameplay_ui.mjs) clicks the hidden #lanVsButton. Same here.
  let button=document.getElementById("lanVsButton");
  if(!button){
    button=document.createElement("button");
    button.type="button";button.id="lanVsButton";button.hidden=true;button.textContent="VS";
    document.body.append(button);
  }
  button.addEventListener("click",async()=>{
    if(finder){
      try{finder.stop();}catch{}
      finder=null;button.textContent="VS";return;
    }
    finder=new LanVsFinder({onPose:(pose)=>timeline.push(pose)});
    try{await finder.start(["spawncity-native"]);button.textContent="IN ROOM";}
    catch(error){button.textContent="OFFLINE";finder=null;console.warn("native session",error);}
  });
  // GPS live mode lives in native_gps_live.mjs (production port).
}
export function tickNativeSession(game){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const pose=game.flight?.position?.();
  if(finder&&pose)finder.setPose({p:pose,q:[0,0,0,1],v:game.flight.linear?.()||[0,0,0],t:performance.now()});
  peers?.update();
  paint(renderer,"session/facade",CRACK,marks.slice(-30));
}
export function markFacade(point){
  if(!point)return;
  marks.push(fromTRS(point,[0,0,0,1],[1,1,1]));
  if(marks.length>30)marks.shift();
}
