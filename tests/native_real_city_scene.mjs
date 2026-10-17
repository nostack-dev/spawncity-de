import * as THREE from "three";
import {NativeStaticBatches} from "../sim/native_webgl2_static.mjs";

// This is a real SpawnCity geometry feeder, NOT a whole-engine renderer.
// It takes the same streamed, destructible city chunk buffers that the game
// built and runs them through both Three unlit and native WebGL2 on two offscreen
// canvases. The production PBR/shadows/windows are not included.
globalThis.__runNativeRealCityProof=async function({width=960,height=540,maxChunks=40,maxTriangles=180000}={}){
  const bridge=globalThis.__arondightRealWorld,world=bridge?.threeScene,realCam=bridge?.presentedCamera?.()||bridge?.threeCamera;
  if(!world||!realCam)throw Error("SpawnCity real world/camera not ready");
  const group=world.getObjectByName("WORLD_CITY_BUILDINGS");
  if(!group)throw Error("World city building group not loaded");
  const candidates=[];
  group.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name!=="WORLD_CITY_CHUNK"||!mesh.parent)return;
    const geo=mesh.geometry,positions=geo?.attributes?.position?.array,colors=geo?.attributes?.color?.array;
    if(!positions||!colors||positions.length!==colors.length||positions.length<9||positions.length%9)return;
    // Source geometry is already all triangles and is dynamically modified by
    // damage/sway: snapshot both attributes *after* those mutations.
    const sphere=geo.boundingSphere,center=sphere?.center||{x:0,y:0,z:0};
    const dx=center.x-realCam.position.x,dy=center.y-realCam.position.y,dz=center.z-realCam.position.z;
    candidates.push({positions,colors,sq:dx*dx+dy*dy+dz*dz});
  });
  candidates.sort((a,b)=>a.sq-b.sq);
  const chunks=[];let triangles=0;
  for(const c of candidates){const count=c.positions.length/9;if(triangles+count>maxTriangles||chunks.length>=maxChunks)continue;
    const p=new Float32Array(c.positions),cl=new Float32Array(c.colors);chunks.push({p,cl});triangles+=count;}
  if(!chunks.length)throw Error("No valid streamed city solid chunks to compare");
  const refCanvas=document.createElement("canvas"),nativeCanvas=document.createElement("canvas");
  for(const c of[refCanvas,nativeCanvas]){c.width=width;c.height=height;}
  const camera=new THREE.PerspectiveCamera(realCam.fov||70,width/height,realCam.near||.01,realCam.far||1500);
  camera.position.fromArray(realCam.position.toArray());camera.quaternion.fromArray(realCam.quaternion.toArray());
  camera.up.fromArray(realCam.up.toArray());camera.aspect=width/height;
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const reference=new THREE.WebGLRenderer({canvas:refCanvas,antialias:false,preserveDrawingBuffer:true});
  reference.setPixelRatio(1);reference.setSize(width,height,false);
  reference.outputColorSpace=THREE.LinearSRGBColorSpace;reference.toneMapping=THREE.NoToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0,0,0);
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});
  const nativeGL=nativeCanvas.getContext("webgl2",{antialias:false,preserveDrawingBuffer:true,alpha:false});
  const native=new NativeStaticBatches(nativeGL,{width,height});
  for(const {p,cl} of chunks){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.BufferAttribute(p,3));
    geo.setAttribute("color",new THREE.BufferAttribute(cl,3));
    const mesh=new THREE.Mesh(geo,material);mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;scene.add(mesh);
    native.add(p,cl);
  }
  // Exercise a LIVE-mesh mutation: the native VBO must update without losing
  // the VAO/program, just as SpawnCity's crater/sway/nuke updates the chunk.
  if(chunks[0]?.p.length>=9){
    for(const vertexZ of [2,5,8])chunks[0].p[vertexZ]-=.35;
    scene.children[0].geometry.attributes.position.needsUpdate=true;
    native.update(native.batches[0],chunks[0].p,chunks[0].cl);
  }
  const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const mvp=new Float32Array(matrix.elements);
  const three=()=>{reference.render(scene,camera);reference.getContext().finish();};
  const gl=()=>native.render(mvp,{finish:true});
  for(let i=0;i<12;i++){three();gl();}
  const measure=()=>{
    const times={three:[],native:[]};
    for(let i=0;i<70;i++){
      const order=i%2?[["native",gl],["three",three]]:[["three",three],["native",gl]];
      for(const [key,fn] of order){const t=performance.now();fn();times[key].push(performance.now()-t);}
    }
    return Object.fromEntries(Object.entries(times).map(([k,a])=>{
      a.sort((x,y)=>x-y);
      return [k,{meanMs:+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(3),p50Ms:+a[Math.floor(a.length*.5)].toFixed(3),p95Ms:+a[Math.floor(a.length*.95)].toFixed(3)}];
    }));
  };
  const duration=measure();three();gl();
  const a=new Uint8Array(width*height*4),b=new Uint8Array(width*height*4);
  reference.getContext().readPixels(0,0,width,height,nativeGL.RGBA,nativeGL.UNSIGNED_BYTE,a);
  nativeGL.readPixels(0,0,width,height,nativeGL.RGBA,nativeGL.UNSIGNED_BYTE,b);
  let error=0,visible=0,large=0;
  for(let i=0;i<width*height;i++){const j=i*4;
    if(a[j]+a[j+1]+a[j+2]+b[j]+b[j+1]+b[j+2]<12)continue;
    const d=(Math.abs(a[j]-b[j])+Math.abs(a[j+1]-b[j+1])+Math.abs(a[j+2]-b[j+2]))/3;
    visible++;error+=d;if(d>20)large++;
  }
  const info={kind:"actual-streamed-city-geometry-unlit-only-not-production-materials",realCityChunks:candidates.length,comparedChunks:chunks.length,
    triangles,drawCalls:chunks.length,width,height,dynamicNativeVboUpdated:true,three:duration.three,native:duration.native,
    rgbMeanAbsoluteDifference:visible?+(error/visible).toFixed(3):null,
    pixelsDifferentOver20:visible?+(100*large/visible).toFixed(3):null,
    gpu:String(nativeGL.getParameter(nativeGL.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL||nativeGL.RENDERER)),
    realWorldMode:document.querySelector("#viewport")?.dataset.worldMode||"unknown",
    threeImage:refCanvas.toDataURL("image/png"),nativeImage:nativeCanvas.toDataURL("image/png")};
  for(const mesh of scene.children)mesh.geometry.dispose();
  material.dispose();native.dispose();reference.dispose();return info;
};
