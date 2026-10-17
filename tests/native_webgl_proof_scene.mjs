import * as THREE from "three";
import {NativeStaticBatches} from "../sim/native_webgl2_static.mjs";

// Isolated identical batched city-geometry experiment. NOT a substitute for
// SpawnCity's real shaders, shadows, effects or a full engine migration.
const WIDTH=960,HEIGHT=540,BATCHES=16,BUILDINGS=1024;
const threeCanvas=document.getElementById("three-canvas");
const nativeCanvas=document.getElementById("native-canvas");
for(const c of [threeCanvas,nativeCanvas]){c.width=WIDTH;c.height=HEIGHT;}
const scene=new THREE.Scene();scene.background=new THREE.Color(0,0,0);
const camera=new THREE.PerspectiveCamera(58,WIDTH/HEIGHT,.3,1000);
camera.up.set(0,0,1);camera.position.set(190,-220,185);camera.lookAt(0,0,8);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
const renderer=new THREE.WebGLRenderer({canvas:threeCanvas,antialias:false,alpha:false,preserveDrawingBuffer:true});
renderer.setSize(WIDTH,HEIGHT,false);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
renderer.shadowMap.enabled=false;
const raw=nativeCanvas.getContext("webgl2",{antialias:false,alpha:false,preserveDrawingBuffer:true});
if(!raw)throw Error("WebGL2 required for native comparison");
raw.viewport(0,0,WIDTH,HEIGHT);raw.clearColor(0,0,0,1);raw.enable(raw.DEPTH_TEST);raw.depthFunc(raw.LEQUAL);raw.disable(raw.CULL_FACE);
const native=new NativeStaticBatches(raw,{width:WIDTH,height:HEIGHT});
let seed=324785;const rng=()=>((seed=Math.imul(seed^seed>>>15,2246822519)+3266489917|0)>>>0)/4294967296;
const vertices=Array.from({length:BATCHES},()=>[]),colors=Array.from({length:BATCHES},()=>[]);
const faces=[[0,1,2,0,2,3],[4,7,6,4,6,5],[0,4,5,0,5,1],[1,5,6,1,6,2],[2,6,7,2,7,3],[3,7,4,3,4,0]];
for(let i=0;i<BUILDINGS;i++){
  const x=(i%32-16)*5.8+(rng()-.5),y=(Math.floor(i/32)-16)*5.8+(rng()-.5),z=3+26*rng(),w=2.2+rng()*2.1,d=2.2+rng()*2.1;
  const p=[[x-w,y-d,0],[x+w,y-d,0],[x+w,y+d,0],[x-w,y+d,0],[x-w,y-d,z],[x+w,y-d,z],[x+w,y+d,z],[x-w,y+d,z]];
  const out=vertices[i%BATCHES],col=colors[i%BATCHES],base=.25+.55*rng();
  for(let face=0;face<faces.length;face++){
    const mult=.7+.055*face;
    for(const id of faces[face]){out.push(...p[id]);col.push(base*mult,.60*base*mult,.75*base*mult);}
  }
}
for(let k=0;k<BATCHES;k++){
  const position=new Float32Array(vertices[k]),color=new Float32Array(colors[k]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(position,3));geometry.setAttribute("color",new THREE.BufferAttribute(color,3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false}));
  mesh.frustumCulled=false;scene.add(mesh);
  native.add(position,color);
}
const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
const rawFrame=()=>{native.render(new Float32Array(matrix.elements),{finish:true});};
const threeFrame=()=>{renderer.render(scene,camera);renderer.getContext().finish();};
for(let i=0;i<18;i++){threeFrame();rawFrame();}
const times={three:[],native:[]},N=72;
for(let i=0;i<N;i++){
  for(const [key,fn] of i%2===0?[["three",threeFrame],["native",rawFrame]]:[["native",rawFrame],["three",threeFrame]]){
    const start=performance.now();fn();times[key].push(performance.now()-start);
  }
}
const summary=values=>{const a=[...values].sort((x,y)=>x-y);return{p50Ms:+a[Math.floor(a.length*.5)].toFixed(3),p95Ms:+a[Math.floor(a.length*.95)].toFixed(3),meanMs:+(a.reduce((u,v)=>u+v,0)/a.length).toFixed(3)};};
threeFrame();rawFrame();
const threePixel=new Uint8Array(WIDTH*HEIGHT*4),nativePixel=new Uint8Array(WIDTH*HEIGHT*4);
renderer.getContext().readPixels(0,0,WIDTH,HEIGHT,raw.RGBA,raw.UNSIGNED_BYTE,threePixel);
raw.readPixels(0,0,WIDTH,HEIGHT,raw.RGBA,raw.UNSIGNED_BYTE,nativePixel);
let diff=0,visible=0,bad=0;
for(let i=0;i<WIDTH*HEIGHT;i++){
  const j=i*4;
  if(threePixel[j]+threePixel[j+1]+threePixel[j+2]+nativePixel[j]+nativePixel[j+1]+nativePixel[j+2]<12)continue;
  visible++;
  const d=(Math.abs(threePixel[j]-nativePixel[j])+Math.abs(threePixel[j+1]-nativePixel[j+1])+Math.abs(threePixel[j+2]-nativePixel[j+2]))/3;
  diff+=d;if(d>20)bad++;
}
const debug=raw.getExtension("WEBGL_debug_renderer_info");
globalThis.__nativeProof={
  kind:"equal-geometry-batched-unlit-benchmark-not-full-engine",
  renderer:String(raw.getParameter(debug?.UNMASKED_RENDERER_WEBGL||raw.RENDERER)),
  width:WIDTH,height:HEIGHT,buildings:BUILDINGS,batches:BATCHES,triangles:BUILDINGS*12,
  three:summary(times.three),native:summary(times.native),
  threeDrawCalls:renderer.info.render.calls,nativeDrawCalls:native.batches.length,
  imageMeanAbsoluteDifference:visible?+(diff/visible).toFixed(2):null,
  imagePixelsDifferingOver20Pct:visible?+(100*bad/visible).toFixed(2):null,
  threeDataUrl:threeCanvas.toDataURL("image/png"),nativeDataUrl:nativeCanvas.toDataURL("image/png")
};
