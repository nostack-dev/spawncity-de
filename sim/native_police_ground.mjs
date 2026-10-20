// Ground police, the live rules. Three cruisers, two officers each.
// They chase on the road, stop at 17 m on foot, officers run and shoot.
// Counts, damage and hit chance are wanted_system_logic.
import {ORIGINAL_SEDAN} from "./native_original_vehicles.mjs";
import {ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {wantedPoliceDamage,wantedPoliceFireRangeM,wantedPoliceShotIntervalMs,wantedPoliceHitChance} from "./wanted_system_logic.mjs";

const MAX_UNITS=3,COPS=2,RUN=3.7,STOP_FOOT=17,RETURN_M=42,SPAWN_MIN=70,SPAWN_MAX=125;
const units=[];
let drawn=false,lastShot=0;
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
function stars(){return Number(globalThis.__arondightWantedSystem?.stars?.())||0;}
function player(){
  const w=globalThis.__arondightWalkMode,p=w?.position;
  return p?[p.x,p.y,p.z||1]:[0,0,2];
}
function nearestRoadPoint(x,y){
  const routes=globalThis.__arondightProceduralPopulation?.roads?.()||[];
  let best=null,bd=Infinity;
  for(const route of routes)for(const seg of route.segments||[]){
    const d=(seg.a[0]-x)**2+(seg.a[1]-y)**2;
    if(d<bd){bd=d;best={x:seg.a[0],y:seg.a[1],yaw:Math.atan2(seg.dy,seg.dx)};}
  }
  return best;
}
export function installNativePolice(){
  globalThis.__arondightPoliceGround={units:()=>units,version:"gta-police-cruisers+officers-v1"};
}
export function tickNativePolice(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const n=stars(),p=player(),onFoot=game?.mode==="foot";
  while(units.length<Math.min(MAX_UNITS,n)){
    const ang=Math.random()*Math.PI*2,dist=SPAWN_MIN+Math.random()*(SPAWN_MAX-SPAWN_MIN);
    const spot=nearestRoadPoint(p[0]+Math.cos(ang)*dist,p[1]+Math.sin(ang)*dist)||{x:p[0]+Math.cos(ang)*dist,y:p[1]+Math.sin(ang)*dist,yaw:ang};
    units.push({x:spot.x,y:spot.y,yaw:spot.yaw,cops:Array.from({length:COPS},(_,i)=>({x:spot.x,y:spot.y,yaw:spot.yaw,out:false,hp:100,i}))});
  }
  while(units.length>n)units.pop();
  const cars=[],officers=[];
  for(const u of units){
    const dx=p[0]-u.x,dy=p[1]-u.y,d=Math.hypot(dx,dy)||1;
    const stop=onFoot&&d<STOP_FOOT;
    if(!stop){u.x+=dx/d*9*(1/60);u.y+=dy/d*9*(1/60);u.yaw=Math.atan2(dy,dx);}
    cars.push(...fromTRS([u.x,u.y,.45],yawQuat(u.yaw),[1,1,1]));
    for(const cop of u.cops){
      if(stop||d>RETURN_M)cop.out=stop;
      if(cop.out&&cop.hp>0){
        const tx=p[0]+(cop.i?6:-6),ty=p[1];
        const cx=tx-cop.x,cy=ty-cop.y,cd=Math.hypot(cx,cy)||1;
        if(cd>1){cop.x+=cx/cd*RUN*(1/60);cop.y+=cy/cd*RUN*(1/60);}
        cop.yaw=Math.atan2(p[1]-cop.y,p[0]-cop.x);
        if(d<wantedPoliceFireRangeM(n)&&now-lastShot>wantedPoliceShotIntervalMs(n)){
          if(Math.random()<wantedPoliceHitChance({stars:n,distanceM:d,playerSpeedMps:0}))
            globalThis.__arondightPlayerDamageModel?.damage?.(wantedPoliceDamage(n));
          lastShot=now;
        }
      }else{cop.x=u.x;cop.y=u.y;cop.yaw=u.yaw;}
      if(cop.hp>0)officers.push(...fromTRS([cop.x,cop.y,0],yawQuat(cop.yaw),[1,1,1]));
    }
  }
  const paint=(id,geo,data)=>{
    if(!data.length){if(drawn)renderer.remove(id);return;}
    const transforms=new Float32Array(data);
    if(drawn)renderer.updateInstances(id,{transforms});
    else renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});
  };
  paint("police/cars",ORIGINAL_SEDAN,cars);
  paint("police/cops",ORIGINAL_HUMAN,officers);
  drawn=cars.length>0;
}
export function hitNativeCops(origin,dir,range){
  let best=null,bestT=range;
  for(const u of units)for(const cop of u.cops){
    if(cop.hp<=0)continue;
    const ox=cop.x-origin[0],oy=cop.y-origin[1],oz=1.1-origin[2];
    const t=ox*dir[0]+oy*dir[1]+oz*dir[2];
    if(t<0||t>bestT)continue;
    const px=origin[0]+dir[0]*t-cop.x,py=origin[1]+dir[1]*t-cop.y,pz=origin[2]+dir[2]*t-1.1;
    if(px*px+py*py+pz*pz<.4*.4){best=cop;bestT=t;}
  }
  if(!best)return null;
  best.hp-=25;
  return {point:[origin[0]+dir[0]*bestT,origin[1]+dir[1]*bestT,origin[2]+dir[2]*bestT]};
}
