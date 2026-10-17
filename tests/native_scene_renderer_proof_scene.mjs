import {NativeSceneRenderer} from "../sim/native_scene_renderer.mjs";
import {fromTRS} from "../sim/native_render_math.mjs";
import {buildNativeCityGeometry} from "../sim/native_city_geometry.mjs";
import {buildNativeTerrainTile} from "../sim/native_terrain_geometry.mjs";
import {packCityMesh} from "../sim/native_city_indexed.mjs";
import {buildingFootprintsFromFeatures} from "../sim/world_building_collisions.mjs";

// Non-production GPU proof of the standalone native scene engine.
// No Three.js or old renderer is imported by this test or the engine.
const canvas=document.getElementById("native-scene"),width=960,height=540;
const renderer=new NativeSceneRenderer(canvas,{width,height,shadows:{resolution:256,extent:160}});
renderer.setCamera({eye:[95,-122,115],target:[0,0,13],near:.3,far:1000,fov:Math.PI/2.9});
renderer.setLighting({sunDirection:[-.4,-.6,.8],skyColor:[.53,.63,.74],groundColor:[.27,.33,.27],exposure:1.15,fogDensity:.0005});
const p=[],colors=[],uvs=[];
const face=(a,b,c,d,col)=>{
  for(const index of [0,1,2,0,2,3]){
    const v=[a,b,c,d][index];p.push(...v);colors.push(...col);
    const tex=[[0,0],[1,0],[1,1],[0,1]][index];uvs.push(...tex);
  }
};
face([-.5,-.5,0],[.5,-.5,0],[.5,-.5,1],[-.5,-.5,1],[.85,.72,.6]);
face([.5,-.5,0],[.5,.5,0],[.5,.5,1],[.5,-.5,1],[.66,.73,.86]);
face([.5,.5,0],[-.5,.5,0],[-.5,.5,1],[.5,.5,1],[.77,.65,.51]);
face([-.5,.5,0],[-.5,-.5,0],[-.5,-.5,1],[-.5,.5,1],[.62,.7,.68]);
face([-.5,-.5,1],[.5,-.5,1],[.5,.5,1],[-.5,.5,1],[.44,.46,.5]);
face([-.5,.5,0],[.5,.5,0],[.5,-.5,0],[-.5,-.5,0],[.4,.4,.43]);
const transforms=[],tints=[];
let seed=85493;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)>>>0)/2**32;
const count=900;
for(let i=0;i<count;i++){
  const x=(i%30-14.5)*5.5+(rand()-.5)*1.2,y=(Math.floor(i/30)-14.5)*5.5+(rand()-.5)*1.2;
  const h=5+rand()*45,size=2.1+rand()*1.7;
  transforms.push(...fromTRS([x,y,0],[0,0,0,1],[size,size,h]));
  const v=.75+rand()*.25;tints.push(v,v*.94,v*.91,1);
}
renderer.upsert("city",{
  positions:new Float32Array(p),
  colors:new Float32Array(colors),
  uvs:new Float32Array(uvs),
  instances:{transforms:new Float32Array(transforms),tints:new Float32Array(tints)},
  material:{color:[1,1,1,1],alphaMode:"opaque",doubleSided:true,facade:true}
});
// Native indexed 5 m terrain using exactly the Box3D SW-NE cell diagonal.
const nativeTerrain=buildNativeTerrainTile({x0:-120,y0:-120,cells:48,step:5,
 heightAt:(x,y)=>Math.sin(x/18)*.6+Math.cos(y/24)*.45});
renderer.upsert("ground",{
 positions:nativeTerrain.positions,normals:nativeTerrain.normals,
 colors:nativeTerrain.colors,uvs:nativeTerrain.uvs,indices:nativeTerrain.indices,
 material:{color:[.8,.91,.72,1],doubleSided:true}
});
const glassInstances=[];
for(let i=0;i<35;i++)glassInstances.push(...fromTRS([(i%7-3)*12,(Math.floor(i/7)-2)*15,3],[0,0,0,1],[3,3,5]));
renderer.upsert("glass",{
  positions:new Float32Array(p),
  instances:{transforms:new Float32Array(glassInstances)},
  material:{color:[.11,.42,.73,.19],alphaMode:"blend",doubleSided:true,unlit:true}
});
// Prove a deliberately distant native mesh is eliminated BEFORE GPU draw.
renderer.upsert("fully-outside-camera",{
  positions:new Float32Array(p),
  instances:{transforms:fromTRS([9000,9000,9000])},
  material:{color:[1,0,0,1],doubleSided:true}
});
// A separate two-bone native skinned actor; moving its upper joint requires
// only a bone uniform update, not a vertex-buffer rebuild.
// Real-game GeoJSON footprint format -> the new native city triangles -> GPU.
// Courtyard and concave buildings exercise the production OSM mesh contract.
const geoFeatures=[
 {id:"courtyard",properties:{height:28},geometry:{type:"Polygon",coordinates:[
   [[-103,-101],[-76,-101],[-76,-72],[-103,-72],[-103,-101]],
   [[-95,-93],[-95,-82],[-85,-82],[-85,-93],[-95,-93]]
 ]}},
 {id:"L-block",properties:{height:17,min_height:2},geometry:{type:"Polygon",coordinates:[
   [[-106,26],[-63,26],[-63,34],[-92,34],[-92,58],[-106,58],[-106,26]]
 ]}}
];
const buildingFootprints=buildingFootprintsFromFeatures(geoFeatures,{center:[-85,-50],radiusM:500});
const nativeCity=buildNativeCityGeometry(buildingFootprints,{chunkSize:400});
if(nativeCity.built!==2||nativeCity.skipped.length)throw Error("real OSM city geometry conversion failed");
let savedCityGpuBytes=0,indexedCityChunks=0,sourceCityGpuBytes=0;
for(const part of nativeCity.chunks){
 const compact=packCityMesh(part);
 sourceCityGpuBytes+=compact.bytesBefore;
 savedCityGpuBytes+=compact.bytesBefore-compact.bytesAfter;
 if(compact.indexed)indexedCityChunks++;
 const mesh=compact.mesh;
 renderer.upsert("osm-"+part.id,{
   positions:mesh.positions,normals:mesh.normals,colors:mesh.colors,uvs:mesh.uvs,indices:mesh.indices,
   material:{facade:true,doubleSided:false,color:[1,1,1,1]}
 });
}
const actorJoints=new Float32Array(p.length/3*4),actorWeights=new Float32Array(p.length/3*4);
for(let i=0;i<p.length/3;i++){const j=p[i*3+2]>.5?1:0;actorJoints[i*4]=j;actorWeights[i*4]=1;}
const actorBones=new Float32Array(32);actorBones.set(fromTRS([0,0,0]),0);actorBones.set(fromTRS([0,0,0]),16);
renderer.upsert("actor",{
  positions:new Float32Array(p),colors:new Float32Array(colors),
  skin:{joints:actorJoints,weights:actorWeights,bones:actorBones},
  instances:{transforms:fromTRS([0,-85,0],[0,0,0,1],[3.5,3.5,12])},
  material:{color:[.94,.4,.32,1],doubleSided:true}
});
const animatedBones=new Float32Array(actorBones);
animatedBones.set(fromTRS([0,0,1.3],[0,0,.12,.9927738917]),16);
renderer.updateBones("actor",animatedBones);
for(let i=0;i<10;i++)renderer.render();
const times=[];
for(let i=0;i<50;i++){const start=performance.now();renderer.render();renderer.gl.finish();times.push(performance.now()-start);}
const newTransforms=new Float32Array(transforms);newTransforms[12]+=5;
renderer.updateInstances("city",{transforms:newTransforms,tints:new Float32Array(tints)});
const stats=renderer.render();renderer.gl.finish();
const gl=renderer.gl,pixels=new Uint8Array(width*height*4);
gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
const errors=gl.getError();
let nonBackground=0;
for(let i=0;i<pixels.length;i+=4)
  if(Math.abs(pixels[i]-12)>15||Math.abs(pixels[i+1]-18)>15||Math.abs(pixels[i+2]-31)>15)nonBackground++;
const screenshot=document.createElement("canvas");screenshot.width=width;screenshot.height=height;
const context=screenshot.getContext("2d"),image=context.createImageData(width,height);
for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);
context.putImageData(image,0,0);
times.sort((a,b)=>a-b);
globalThis.__nativeSceneProof={
  schema:"native-webgl2-scene-nonproduction-proof-v1",
  osmBuildingFootprints:nativeCity.built,osmCityChunks:nativeCity.chunks.length,
  terrainTriangles:nativeTerrain.triangles,terrainVertices:nativeTerrain.vertexCount,terrainIndexed:nativeTerrain.indices.length>0,
  indexedCityChunks,sourceCityGpuBytes,savedCityGpuBytes,
  kind:"new-native-engine-only-not-game-migration",count,backend:"native-webgl2",
  drawCalls:stats.drawCalls,shadowDrawCalls:stats.shadowDrawCalls,shadowResolution:stats.shadowResolution,triangles:stats.triangles,instances:stats.instances,culledMeshes:stats.culledMeshes,
  cpuFrameMs:stats.cpuMs,gpuTimeMs:stats.gpuMs,
  finishP50Ms:+times[Math.floor(times.length*.5)].toFixed(3),
  finishP95Ms:+times[Math.floor(times.length*.95)].toFixed(3),
  nonBackgroundPixels:nonBackground,glError:errors,
  renderer:String(gl.getParameter(gl.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL||gl.RENDERER)),
  imageDataUri:screenshot.toDataURL("image/png")
};
renderer.dispose();
