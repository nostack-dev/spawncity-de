import {gameUrl,pagesOrigin} from "../sim/site_config.mjs";

export function liveGameUrl(){
  const override=String(process.env.PUBLIC_SITE_URL||"").replace(/\/ /,"");
  if(!override)return gameUrl();
  return override.endsWith(".html")?override:`${override}/drone_simulator.html`;
}
export function liveEditorUrl(){
  return process.env.EDITOR3D_URL||`${pagesOrigin()}/editor3d.html`;
}
