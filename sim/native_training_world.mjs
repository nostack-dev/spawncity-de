// The production training world on the native page. Production starts here
// when there is no GPS fix and no chosen place (worldMode "training"):
// training_test_level_v2.mjs (roads, parks, harbour pond, bridge, dock,
// skyline, trees) plus training_showcase.mjs (plaza, gates, launch pads,
// range, ramps, lamps). The layout is production's own fixed level, laid out
// in local metres and fed through the same native city / road / Box3D path.
import {nativeOsmProjector} from "./native_osm_projector.mjs";
export const NATIVE_TRAINING_WORLD_VERSION="native-training-level-v2-showcase";
export const NATIVE_TRAINING_ORIGIN=Object.freeze({lon:9.17442,lat:47.66022});
const R=6378137,RAD=Math.PI/180;
function lonLat(origin,x,y){const cos=Math.max(.01,Math.cos(origin.lat*RAD));return [origin.lon+x/(RAD*R*cos),origin.lat+y/(RAD*R)];}
// [x,y,w,d,h] from training_test_level_v2 (brick / cream / concrete blocks).
const BUILDINGS=[[-47,-22,15,13,10],[-27,-23,13,12,15],[31,-23,15,13,12],[50,-22,12,12,18],
 [-51,18,13,12,14],[-18,24,14,11,20],[54,15,13,12,11],[-55,61,16,11,9],[55,64,18,12,13]];
// road(x,y,w,h) rectangles of the level as centre lines with a matching class.
const ROADS=[[0,-38,124,8],[0,38,124,8],[-62,0,8,76],[62,0,8,76],[0,0,168,11],[0,0,10,152],[0,54,140,8]];
const TREES=[[-42,30],[-32,34],[-48,22],[44,-29],[51,-22],[24,61],[-21,59]];
const cls=w=>w>=11?"primary":w>=10?"secondary":"tertiary";
export function buildNativeTrainingSnapshot(origin=NATIVE_TRAINING_ORIGIN){
  const ring=pts=>{const r=pts.map(([x,y])=>lonLat(origin,x,y));r.push(r[0]);return r;};
  const buildings=BUILDINGS.map(([x,y,w,d,h],i)=>({id:"training-building-"+i,
    properties:{building:"yes",height:h+.1,min_height:0,training:true},
    geometry:{type:"Polygon",coordinates:[ring([[x-w/2,y-d/2],[x+w/2,y-d/2],[x+w/2,y+d/2],[x-w/2,y+d/2]])]}}));
  const roads=ROADS.map(([x,y,w,h],i)=>{
    const horizontal=w>=h,width=horizontal?h:w,len=horizontal?w:h;
    const a=horizontal?[x-len/2,y]:[x,y-len/2],b=horizontal?[x+len/2,y]:[x,y+len/2];
    return {id:"training-road-"+i,properties:{highway:cls(width),class:cls(width),training:true},
      geometry:{type:"LineString",coordinates:[lonLat(origin,...a),lonLat(origin,...b)]}};
  });
  const ellipse=(cx,cy,rx,ry,n=40)=>Array.from({length:n},(_,k)=>{const t=k/n*Math.PI*2;return [cx+Math.cos(t)*rx,cy+Math.sin(t)*ry];});
  const areas=[
    {id:"training-park-0",class:"park",properties:{leisure:"park"},geometry:{type:"Polygon",coordinates:[ring([[-59,13],[-17,13],[-17,43],[-59,43]])]}},
    {id:"training-park-1",class:"park",properties:{leisure:"park"},geometry:{type:"Polygon",coordinates:[ring([[32,-36],[64,-36],[64,-14],[32,-14]])]}},
    {id:"training-pond",class:"water",properties:{natural:"water"},geometry:{type:"Polygon",coordinates:[ring(ellipse(34,31,31,18.4))]}}
  ];
  return {buildings,roads,water:[],pastures:[],areas,source:"spawncity-training-level",synthetic:false,training:true,
    origin:{...origin},center:[0,0],revision:NATIVE_TRAINING_WORLD_VERSION};
}
// ---- props drawn straight on the native renderer
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
function box(b,[cx,cy,z0],[w,d,h],col){
  const x0=cx-w/2,x1=cx+w/2,y0=cy-d/2,y1=cy+d/2,z1=z0+h;
  const faces=[[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],[[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0],[0,0,-1]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],[[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0]],
    [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],[[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0]]];
  for(const [a,b2,c,d2,n] of faces)for(const v of [a,b2,c,a,c,d2]){b.p.push(...v);b.n.push(...n);b.c.push(...col);}
}
function disc(b,[cx,cy,z],r,col,n=40,sx=1,sy=1){
  for(let k=0;k<n;k++){const t0=k/n*Math.PI*2,t1=(k+1)/n*Math.PI*2;
    for(const v of [[cx,cy,z],[cx+Math.cos(t0)*r*sx,cy+Math.sin(t0)*r*sy,z],[cx+Math.cos(t1)*r*sx,cy+Math.sin(t1)*r*sy,z]]){b.p.push(...v);b.n.push(0,0,1);b.c.push(...col);}}
}
export function buildNativeTrainingProps(){
  const b={p:[],n:[],c:[]};
  const C={concrete:hex(0xa59c8c),wood:hex(0x6f4e33),crown:hex(0x3f6f35),asphalt:hex(0x273039),line:hex(0xe8f0f4),cyan:hex(0x2d9fc3),
    orange:hex(0xd88937),dark:hex(0x171d22),green:hex(0x3e7e59),range:hex(0x606a70),ramp:hex(0x4b535a),roof:hex(0x3c4248)};
  // training_test_level_v2: bridge, dock, trees
  box(b,[34,31,.082],[5,42,.18],C.concrete);box(b,[48,47,.07],[18,3,.16],C.wood);
  for(const [x,y] of TREES){box(b,[x,y,.04],[.28,.28,2.7],C.wood);box(b,[x,y,2.25],[2.2,2.2,2.2],C.crown);}
  // training_showcase: plaza, helipad, promenade lines, gates, pads, range, ramps, lamps
  disc(b,[0,0,.05],34,C.asphalt,48);
  for(const x of [-4.8,4.8])box(b,[x,0,.064],[.13,78,.018],C.line);
  for(let y=-36;y<=36;y+=8)box(b,[0,y,.065],[.12,3.5,.02],C.line);
  const archYs=[-30,-14,14,30];
  archYs.forEach((y,i)=>{const m=i%2?C.cyan:C.orange;box(b,[-6.2,y,0],[.42,.42,4.2],m);box(b,[6.2,y,0],[.42,.42,4.2],m);box(b,[0,y,3.86],[12.8,.42,.34],m);});
  for(const [x,y] of [[-27,-24],[27,-24],[-27,24],[27,24]]){box(b,[x,y,0],[.26,.26,5.4],C.dark);box(b,[x,y,5.3],[.5,.5,.4],hex(0x8bdcff));}
  for(let i=0;i<7;i++){const x=15+(i%2)*4.2,y=-27+Math.floor(i/2)*5.4;box(b,[x,y,.065],[3.5,4.5,.025],i%2?C.dark:C.green);box(b,[x,y,.09],[2.6,.12,.02],C.line);}
  box(b,[20,-5,1.2],[8,.18,2],C.cyan);
  for(let i=0;i<6;i++){const y=-22+i*8,x=-26+(i%2)*2;box(b,[x,y,0],[.5,.16,1.45],C.range);box(b,[x+2.2,y,.07],[3.2,.08,.02],C.orange);}
  for(const y of [-18,18])box(b,[21,y,.07],[7,4,.22],C.ramp);
  return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};
}
export function installNativeTrainingProps(game){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return false;
  renderer.upsert("training/props",{...buildNativeTrainingProps(),material:{color:[1,1,1,1],castShadow:true}});
  const v=document.getElementById("viewport");if(v){v.dataset.worldMode="training";v.dataset.trainingLevel=NATIVE_TRAINING_WORLD_VERSION;}
  return true;
}
export function removeNativeTrainingProps(game){game?.world?.renderer?.remove?.("training/props");}
