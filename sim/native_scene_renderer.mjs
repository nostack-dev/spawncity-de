// Native-only WebGL2 scene renderer: never imports Three.js.
// GPU instancing, mutable buffers, material/texture support, sky+sun lighting,
// alpha sorting, fog, asynchronous GPU timers and loss/recovery.
// TODO for full game release: shadow maps, effects, picking and every
// gameplay scene producer; native-only release gate remains closed.
import {multiply4,lookAt,perspective,identity4,normalMatrix3} from "./native_render_math.mjs";
export const NATIVE_SCENE_RENDERER_VERSION="native-webgl2-scene-skinned-v4";
const VERT="#version 300 es\n"+[
"precision highp float;",
"layout(location=0) in vec3 aPosition;",
"layout(location=1) in vec3 aNormal;",
"layout(location=2) in vec3 aColor;",
"layout(location=3) in vec2 aUV;",
"layout(location=4) in vec4 iModel0;",
"layout(location=5) in vec4 iModel1;",
"layout(location=6) in vec4 iModel2;",
"layout(location=7) in vec4 iModel3;",
"layout(location=8) in vec4 iTint;",
"layout(location=9) in vec3 iNormal0;",
"layout(location=10) in vec3 iNormal1;",
"layout(location=11) in vec3 iNormal2;",
"layout(location=12) in vec4 aJoints;",
"layout(location=13) in vec4 aWeights;",
"uniform int uSkinEnabled;",
"uniform mat4 uBones[32];",
"uniform mat4 uViewProjection;",
"out vec3 vWorld,vNormal,vColor;",
"out vec2 vUV,vWallUV;out float vOpacity;",
"void main(){",
"  mat4 model=mat4(iModel0,iModel1,iModel2,iModel3);",
"  vec4 local=vec4(aPosition,1.0);",
"  vec3 localNormal=aNormal;",
"  if(uSkinEnabled==1){",
"    mat4 skin=aWeights.x*uBones[int(aJoints.x)]+aWeights.y*uBones[int(aJoints.y)]",
"      +aWeights.z*uBones[int(aJoints.z)]+aWeights.w*uBones[int(aJoints.w)];",
"    local=skin*local;",
"    localNormal=mat3(skin)*localNormal;",
"  }",
"  vec4 p=model*local;",
"  vWorld=p.xyz;",
"  vNormal=normalize(mat3(iNormal0,iNormal1,iNormal2)*localNormal);",
"  vColor=aColor*iTint.rgb;vOpacity=iTint.a;vUV=aUV;",
"  float wallSpan=abs(aNormal.x)>0.5?length(iModel1.xyz):length(iModel0.xyz);",
"  vWallUV=vec2(aUV.x*wallSpan,aUV.y*length(iModel2.xyz));",
"  gl_Position=uViewProjection*p;",
"}"].join("\n");
const FRAG="#version 300 es\n"+[
"precision highp float;",
"in vec3 vWorld,vNormal,vColor;in vec2 vUV,vWallUV;in float vOpacity;",
"uniform vec4 uMaterial;",
"uniform vec3 uSunDirection,uSunColor,uSkyColor,uGroundColor,uEye,uFogColor;",
"uniform float uFogDensity,uExposure,uAlphaCutoff;",
"uniform sampler2D uTexture;",
"uniform int uHasTexture,uUnlit,uFacade;",
"out vec4 outColor;",
"void main(){",
"  vec4 texel=uHasTexture==1?texture(uTexture,vUV):vec4(1.0);",
"  float alpha=clamp(vOpacity*uMaterial.a*texel.a,0.0,1.0);",
"  if(alpha<uAlphaCutoff)discard;",
"  vec3 base=max(vec3(0.0),vColor*uMaterial.rgb*texel.rgb);",
"  vec3 n=normalize(vNormal),sun=normalize(uSunDirection);",
"  if(uFacade==1&&abs(n.z)<0.6){",
"    vec2 uv=vec2(vWallUV.x/2.8,vWallUV.y/3.25);",
"    vec2 cell=fract(uv),fw=max(fwidth(uv),vec2(0.01));",
"    float wx=smoothstep(.20,.20+fw.x,cell.x)*(1.0-smoothstep(.8-fw.x,.8,cell.x));",
"    float wy=smoothstep(.32,.32+fw.y,cell.y)*(1.0-smoothstep(.8-fw.y,.8,cell.y));",
"    float farFade=1.0-smoothstep(.11,.35,max(fw.x,fw.y));",
"    float glass=wx*wy*farFade;",
"    vec3 pane=mix(vec3(.035,.072,.11),vec3(.13,.26,.37),clamp(dot(n,sun)*.6+.28,0.0,1.0));",
"    base=mix(base,pane,glass*.94);",
"    float ledge=(1.0-smoothstep(.05,.09,abs(cell.y-.28)))*farFade;",
"    base=mix(base,base*1.2+vec3(.015),ledge*.18);",
"  }",
"  float ndl=max(dot(n,sun),0.0);",
"  vec3 hemis=mix(uGroundColor,uSkyColor,clamp(n.z*0.5+0.5,0.0,1.0));",
"  vec3 rgb=base*(uUnlit==1?vec3(1.0):hemis+uSunColor*ndl)*uExposure;",
"  rgb=(rgb*(2.51*rgb+0.03))/(rgb*(2.43*rgb+0.59)+0.14);",
"  float fog=1.0-exp(-pow(uFogDensity*length(vWorld-uEye),2.0));",
"  rgb=mix(rgb,uFogColor,clamp(fog,0.0,1.0));",
"  outColor=vec4(clamp(rgb,0.0,1.0),alpha);",
"}"].join("\n");
function typed(name,data,n){
 if(!(data instanceof Float32Array)||data.length%n)throw Error(name+" requires Float32Array / "+n);
 return data;
}
function instances(input){
 const transforms=input?.transforms??identity4();
 typed("transforms",transforms,16);
 if(!transforms.length)throw Error("empty instances");
 const count=transforms.length/16;
 const tints=input?.tints??new Float32Array(count*4).fill(1);
 typed("tints",tints,4);
 if(tints.length!==count*4)throw Error("tint count mismatch");
 const normals=new Float32Array(count*9);
 for(let k=0;k<count;k++){
   const mat=transforms.subarray(k*16,k*16+16),normal=normalMatrix3(mat);
   normals.set(normal,k*9);
 }
 return {transforms,tints,normals,count};
}
function validate(input){
 const p=typed("positions",input.positions,3),count=p.length/3;
 if(!count||(!input.indices&&count%3))throw Error("invalid triangles");
 const indices=input.indices??null;
 if(indices&&(!(indices instanceof Uint16Array||indices instanceof Uint32Array)||indices.length%3||indices.some(i=>i>=count)))throw Error("invalid indices");
 let normals=input.normals;
 if(!normals){
  normals=new Float32Array(p.length);
  if(!indices)for(let k=0;k<p.length;k+=9){
   const ax=p[k+3]-p[k],ay=p[k+4]-p[k+1],az=p[k+5]-p[k+2];
   const bx=p[k+6]-p[k],by=p[k+7]-p[k+1],bz=p[k+8]-p[k+2];
   let x=ay*bz-az*by,y=az*bx-ax*bz,z=ax*by-ay*bx;
   const len=Math.hypot(x,y,z)||1;x/=len;y/=len;z/=len;
   for(let j=0;j<9;j+=3){normals[k+j]=x;normals[k+j+1]=y;normals[k+j+2]=z;}
  }
  else for(let k=2;k<normals.length;k+=3)normals[k]=1;
 }
 const colors=input.colors??new Float32Array(p.length).fill(1);
 const uvs=input.uvs??new Float32Array(count*2);
 typed("normals",normals,3);typed("colors",colors,3);typed("uvs",uvs,2);
 if(normals.length!==p.length||colors.length!==p.length||uvs.length!==count*2)throw Error("geometry attribute count mismatch");
 let skin=null;
 if(input.skin){
  const joints=typed("skin joints",input.skin.joints,4),weights=typed("skin weights",input.skin.weights,4),bones=typed("skin bones",input.skin.bones,16);
  if(joints.length!==count*4||weights.length!==count*4||!bones.length||bones.length>32*16)throw Error("invalid skin vertex/joint palette sizes");
  const boneCount=bones.length/16;
  for(let k=0;k<joints.length;k++)if(!Number.isInteger(joints[k])||joints[k]<0||joints[k]>=boneCount||weights[k]<0||weights[k]>1)throw Error("invalid skin joint/weight");
  for(let k=0;k<weights.length;k+=4){const sum=weights[k]+weights[k+1]+weights[k+2]+weights[k+3];if(Math.abs(sum-1)>.001)throw Error("skin weights must sum to 1");}
  skin={joints,weights,bones};
 }
 return {p,normals,colors,uvs,indices,skin,...instances(input.instances)};
}
function program(gl){
 const shader=(type,src)=>{
  const o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(o);gl.deleteShader(o);throw Error("native shader: "+e);}
  return o;
 };
 const v=shader(gl.VERTEX_SHADER,VERT),f=shader(gl.FRAGMENT_SHADER,FRAG),p=gl.createProgram();
 gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const e=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw Error("native program: "+e);}
 const uniforms=["uViewProjection","uMaterial","uSunDirection","uSunColor","uSkyColor","uGroundColor","uEye","uFogColor","uFogDensity","uExposure","uAlphaCutoff","uTexture","uHasTexture","uUnlit","uFacade","uSkinEnabled","uBones[0]"];
 return {handle:p,u:Object.fromEntries(uniforms.map(k=>[k,gl.getUniformLocation(p,k)]))};
}
export class NativeSceneRenderer{
 constructor(canvas,{width=canvas?.width??960,height=canvas?.height??540}={}){
  if(!canvas?.getContext)throw Error("Canvas required");
  this.canvas=canvas;
  this.gl=canvas.getContext("webgl2",{alpha:false,antialias:false,depth:true,powerPreference:"high-performance",preserveDrawingBuffer:false});
  if(!this.gl)throw Error("Native WebGL2 required; no Three/WebGL1 fallback");
  this.meshes=new Map();this.lost=false;this.disposed=false;
  this.eye=[0,-18,8];this.target=[0,0,2];this.up=[0,0,1];
  this.fov=Math.PI/3;this.near=.05;this.far=1800;
  this.sunDirection=[-.45,-.52,.72];this.sunColor=[.9,.82,.73];
  this.skyColor=[.48,.58,.7];this.groundColor=[.26,.27,.26];this.fogColor=[.68,.8,.88];
  this.fogDensity=.00085;this.exposure=1;this.stats=null;
  this.onLost=e=>{e.preventDefault();this.lost=true;};
  this.onRestored=()=>{this.lost=false;this.init();for(const m of this.meshes.values())this.upload(m);};
  canvas.addEventListener?.("webglcontextlost",this.onLost,false);
  canvas.addEventListener?.("webglcontextrestored",this.onRestored,false);
  this.init();this.resize(width,height);
 }
 init(){
  this.gpu=program(this.gl);
  this.timer=this.gl.getExtension("EXT_disjoint_timer_query_webgl2");
  this.pending=[];this.lastGpuMs=null;
 }
 resize(w,h){
  if(!(w>0&&h>0))throw Error("invalid drawing dimensions");
  const width=Math.round(w),height=Math.round(h);
  if(width===this.width&&height===this.height)return false;
  this.width=width;this.height=height;this.canvas.width=width;this.canvas.height=height;return true;
 }
 setCamera({eye,target,up,fov,near,far}={}){
  if(eye)this.eye=[...eye];if(target)this.target=[...target];if(up)this.up=[...up];
  if(fov!==undefined)this.fov=fov;if(near!==undefined)this.near=near;if(far!==undefined)this.far=far;
 }
 setLighting(values={}){
  for(const key of ["sunDirection","sunColor","skyColor","groundColor","fogColor","fogDensity","exposure"])
   if(values[key]!==undefined)this[key]=Array.isArray(values[key])?[...values[key]]:values[key];
 }
 upsert(id,input){
  if(this.disposed)throw Error("disposed");
  if(typeof id!=="string"||!id.trim())throw Error("mesh needs ID");
  const old=this.meshes.get(id);if(old)this.free(old);
  const m={id,data:validate(input),material:{color:[1,1,1,1],alphaMode:"opaque",unlit:false,doubleSided:false,...input.material},texture:input.texture||null,visible:input.visible!==false};
  this.meshes.set(id,m);if(!this.lost)this.upload(m);return m;
 }
 upload(m){
  const gl=this.gl,d=m.data,vao=gl.createVertexArray();gl.bindVertexArray(vao);m.vao=vao;m.buffers=[];
  [[d.p,3],[d.normals,3],[d.colors,3],[d.uvs,2]].forEach(([values,size],slot)=>{
   const b=gl.createBuffer();m.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);
   gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
   gl.enableVertexAttribArray(slot);gl.vertexAttribPointer(slot,size,gl.FLOAT,false,0,0);
  });
  const t=gl.createBuffer();m.buffers.push(t);gl.bindBuffer(gl.ARRAY_BUFFER,t);gl.bufferData(gl.ARRAY_BUFFER,d.transforms,gl.DYNAMIC_DRAW);
  for(let i=0;i<4;i++){const loc=4+i;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,64,i*16);gl.vertexAttribDivisor(loc,1);}
  const tint=gl.createBuffer();m.buffers.push(tint);gl.bindBuffer(gl.ARRAY_BUFFER,tint);gl.bufferData(gl.ARRAY_BUFFER,d.tints,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(8);gl.vertexAttribPointer(8,4,gl.FLOAT,false,0,0);gl.vertexAttribDivisor(8,1);
  const normal=gl.createBuffer();m.buffers.push(normal);gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,d.normals,gl.DYNAMIC_DRAW);
  for(let i=0;i<3;i++){const loc=9+i;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);gl.vertexAttribDivisor(loc,1);}
  m.capTransforms=d.transforms.length;m.capTints=d.tints.length;m.capNormals=d.normals.length;
  if(d.skin){
    for(const [loc,values]of [[12,d.skin.joints],[13,d.skin.weights]]){
      const buffer=gl.createBuffer();m.buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,4,gl.FLOAT,false,0,0);
    }
  }
  if(d.indices){
   m.element=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.element);
   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);
   m.elementType=d.indices instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
 }
 updateInstances(id,newInstances){
  const m=this.meshes.get(id);if(!m)throw Error("unknown mesh "+id);
  const next=instances(newInstances);Object.assign(m.data,next);
  if(this.lost)return;
  const gl=this.gl;
  for(const [slot,data,cap] of [[4,next.transforms,"capTransforms"],[5,next.tints,"capTints"],[6,next.normals,"capNormals"]]){
   gl.bindBuffer(gl.ARRAY_BUFFER,m.buffers[slot]);
   if(data.length!==m[cap])gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
   else gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
   m[cap]=data.length;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,null);
 }
 updateBones(id,bones){
  const m=this.meshes.get(id);if(!m?.data.skin)throw Error("not a skinned mesh "+id);
  typed("skin bones",bones,16);
  if(bones.length!==m.data.skin.bones.length)throw Error("joint count cannot change without rebuilding mesh");
  m.data.skin.bones=bones;
 }
 free(m){
  if(!this.lost){if(m.vao)this.gl.deleteVertexArray(m.vao);for(const b of m.buffers||[])this.gl.deleteBuffer(b);if(m.element)this.gl.deleteBuffer(m.element);}
  m.vao=null;m.buffers=[];m.element=null;
 }
 remove(id){const m=this.meshes.get(id);if(!m)return false;this.free(m);this.meshes.delete(id);return true;}
 pollGpu(){
  if(!this.timer)return;
  const gl=this.gl,rest=[];
  for(const q of this.pending){
   if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){
    if(!gl.getParameter(this.timer.GPU_DISJOINT_EXT))this.lastGpuMs=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;
    gl.deleteQuery(q);
   }else rest.push(q);
  }
  this.pending=rest;
 }
 render({clearColor=[.045,.07,.12,1]}={}){
  if(this.disposed)throw Error("disposed native scene");
  if(this.lost)throw Error("native GL context lost; waiting for native restoration");
  const gl=this.gl,start=performance.now(),u=this.gpu.u;this.pollGpu();
  let timerQuery=null;
  if(this.timer&&this.pending.length<4){timerQuery=gl.createQuery();gl.beginQuery(this.timer.TIME_ELAPSED_EXT,timerQuery);}
  gl.viewport(0,0,this.width,this.height);gl.clearColor(...clearColor);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.BLEND);gl.useProgram(this.gpu.handle);
  const camera=multiply4(perspective(this.fov,this.width/this.height,this.near,this.far),lookAt(this.eye,this.target,this.up));
  gl.uniformMatrix4fv(u.uViewProjection,false,camera);
  for(const key of ["sunDirection","sunColor","skyColor","groundColor","fogColor","eye"])
   gl.uniform3fv(u["u"+key[0].toUpperCase()+key.slice(1)],new Float32Array(this[key]));
  gl.uniform1f(u.uFogDensity,this.fogDensity);gl.uniform1f(u.uExposure,this.exposure);gl.uniform1i(u.uTexture,0);
  const meshes=[...this.meshes.values()].filter(m=>m.visible);
  const opaque=meshes.filter(m=>m.material.alphaMode!=="blend");
  const transparent=meshes.filter(m=>m.material.alphaMode==="blend");
  transparent.sort((a,b)=>{
   const x=a.data.transforms,y=b.data.transforms;
   return Math.hypot(y[12]-this.eye[0],y[13]-this.eye[1],y[14]-this.eye[2])-Math.hypot(x[12]-this.eye[0],x[13]-this.eye[1],x[14]-this.eye[2]);
  });
  const stats={drawCalls:0,triangles:0,instances:0,cpuMs:0,gpuMs:this.lastGpuMs};
  const draw=m=>{
   const d=m.data,mat=m.material;
   gl.uniform4fv(u.uMaterial,new Float32Array(mat.color));
   gl.uniform1f(u.uAlphaCutoff,mat.alphaMode==="mask"?(mat.alphaCutoff??.5):0);
   gl.uniform1i(u.uUnlit,mat.unlit?1:0);gl.uniform1i(u.uFacade,mat.facade?1:0);gl.uniform1i(u.uHasTexture,m.texture?1:0);
   gl.uniform1i(u.uSkinEnabled,d.skin?1:0);if(d.skin)gl.uniformMatrix4fv(u["uBones[0]"],false,d.skin.bones);
   if(m.texture){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,m.texture);}
   if(mat.doubleSided)gl.disable(gl.CULL_FACE);else{gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);}
   gl.bindVertexArray(m.vao);
   if(d.indices)gl.drawElementsInstanced(gl.TRIANGLES,d.indices.length,m.elementType,0,d.count);
   else gl.drawArraysInstanced(gl.TRIANGLES,0,d.p.length/3,d.count);
   stats.drawCalls++;stats.instances+=d.count;stats.triangles+=(d.indices?d.indices.length:d.p.length/3)/3*d.count;
  };
  for(const m of opaque)draw(m);
  if(transparent.length){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}
  for(const m of transparent)draw(m);
  gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);
  if(timerQuery){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pending.push(timerQuery);}
  stats.cpuMs=+(performance.now()-start).toFixed(3);this.stats=stats;return stats;
 }
 dispose(){
  if(this.disposed)return;
  for(const m of this.meshes.values())this.free(m);
  this.meshes.clear();if(!this.lost){for(const q of this.pending)this.gl.deleteQuery(q);this.gl.deleteProgram(this.gpu.handle);}
  this.pending=[];this.disposed=true;this.canvas.removeEventListener?.("webglcontextlost",this.onLost);this.canvas.removeEventListener?.("webglcontextrestored",this.onRestored);
 }
}
