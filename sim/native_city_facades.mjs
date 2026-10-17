import {FACADE_GLSL,CUTOUT_GLSL,facadeCutouts} from "./world_city_facade_contract.mjs";
// Native WebGL2 facade shader. The geometry generators still need replacing
// before Three can be removed; shading here reuses exact building window rules.
export const NATIVE_FACADE_GL_VERSION="native-city-facades-v1";
const A=[["position",3],["color",3],["aWall",4],["aSeed",1],["aFloorH",1],["normal",3]];
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 position;layout(location=1) in vec3 color;
layout(location=2) in vec4 aWall;layout(location=3) in float aSeed;
layout(location=4) in float aFloorH;layout(location=5) in vec3 normal;
uniform mat4 mvp;
out vec3 vColor;out vec3 vNormal;out vec3 vWinPos;
out vec4 vWall;out float vSeed;out float vFloorH;
void main(){vColor=color;vNormal=normal;vWinPos=position;vWall=aWall;vSeed=aSeed;vFloorH=aFloorH;gl_Position=mvp*vec4(position,1.0);}`;
const FS=`#version 300 es
precision highp float;
in vec3 vColor;in vec3 vNormal;in vec3 vWinPos;
in vec4 vWall;in float vSeed;in float vFloorH;
uniform vec3 uSunDir;uniform vec3 uEye;uniform vec3 uFogColor;
uniform float uSunPower;uniform float uFogDensity;uniform float uExposure;
out vec4 outColor;
float fh(float n){return fract(sin(n*127.1)*43758.5453);}
${CUTOUT_GLSL}
void main(){
  if(facadeCutout(vWinPos,true))discard;
  vec4 diffuseColor=vec4(vColor,1.0);float facGlass=0.0,facRough=0.88;
  ${FACADE_GLSL}
  vec3 N=normalize(vNormal),S=normalize(uSunDir);
  float lambert=max(0.0,dot(N,S));
  float light=(0.66+0.18*N.z)+lambert*uSunPower;
  vec3 rgb=diffuseColor.rgb*max(.32,light);
  float fresnel=pow(1.0-abs(dot(normalize(uEye-vWinPos),N)),3.0);
  rgb+=facGlass*mix(vec3(.035,.05,.065),vec3(.19,.24,.3),fresnel);
  rgb=max(vec3(0.0),rgb*uExposure);
  rgb=(rgb*(2.51*rgb+.03))/(rgb*(2.43*rgb+.59)+.14);
  float dist=length(uEye-vWinPos),fog=1.0-exp(-pow(uFogDensity*dist,2.0));
  rgb=mix(rgb,uFogColor,clamp(fog,0.0,1.0));
  outColor=vec4(clamp(rgb,0.0,1.0),1.0);
}`;
export class NativeCityFacades{
  constructor(gl,{width,height}={}){
    if(!gl?.createVertexArray)throw Error("WebGL2 required");
    this.gl=gl;this.entries=[];this.triangles=0;this.disposed=false;
    const compile=(kind,src)=>{const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(e);}return s;};
    const v=compile(gl.VERTEX_SHADER,VS),f=compile(gl.FRAGMENT_SHADER,FS),p=gl.createProgram();
    gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const e=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw Error(e);}
    this.program=p;this.uniforms=Object.fromEntries(["mvp","uSunDir","uEye","uFogColor","uSunPower","uFogDensity","uExposure","uCutN","uCutA[0]","uCutB[0]"].map(n=>[n,gl.getUniformLocation(p,n)]));
    this.resize(width||gl.drawingBufferWidth,height||gl.drawingBufferHeight);
  }
  resize(w,h){this.width=Math.max(1,Math.round(w));this.height=Math.max(1,Math.round(h));}
  check(a){if(!a||!(a.position instanceof Float32Array)||!a.position.length||a.position.length%9||A.some(([k,n])=>!(a[k] instanceof Float32Array)||a[k].length!==a.position.length/3*n))throw Error("Bad facade VBO attributes");}
  add(a){
    this.check(a);const gl=this.gl,vao=gl.createVertexArray(),buffers=[];gl.bindVertexArray(vao);
    A.forEach(([k,n],slot)=>{const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,a[k],gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(slot);gl.vertexAttribPointer(slot,n,gl.FLOAT,false,0,0);});
    gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    const e={vao,buffers,count:a.position.length/3,length:a.position.length};this.entries.push(e);this.triangles+=e.count/3;return e;
  }
  update(e,a){
    this.check(a);if(!this.entries.includes(e))throw Error("Unknown facade VBO");
    const gl=this.gl,resize=e.length!==a.position.length;
    A.forEach(([k],slot)=>{gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[slot]);if(resize)gl.bufferData(gl.ARRAY_BUFFER,a[k],gl.DYNAMIC_DRAW);else gl.bufferSubData(gl.ARRAY_BUFFER,0,a[k]);});
    gl.bindBuffer(gl.ARRAY_BUFFER,null);this.triangles+=(a.position.length/3-e.count)/3;e.count=a.position.length/3;e.length=a.position.length;
  }
  render(mvp,{clear=false,sunDir=[-.45,-.52,.72],eye=[0,0,50],fogColor=[.75,.83,.89],fogDensity=.00085,sunPower=1.2,exposure=1}={}){
    const gl=this.gl,u=this.uniforms;gl.viewport(0,0,this.width,this.height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
    if(clear){gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
    gl.useProgram(this.program);gl.uniformMatrix4fv(u.mvp,false,mvp);
    gl.uniform3fv(u.uSunDir,new Float32Array(sunDir));gl.uniform3fv(u.uEye,new Float32Array(eye));gl.uniform3fv(u.uFogColor,new Float32Array(fogColor));
    gl.uniform1f(u.uFogDensity,fogDensity);gl.uniform1f(u.uSunPower,sunPower);gl.uniform1f(u.uExposure,exposure);
    const cuts=facadeCutouts,n=Math.max(0,Math.min(6,cuts.uCutN.value|0));gl.uniform1i(u.uCutN,n);
    if(n){const f=a=>new Float32Array(a.flatMap(x=>[x.x,x.y,x.z,x.w]));gl.uniform4fv(u["uCutA[0]"],f(cuts.uCutA.value));gl.uniform4fv(u["uCutB[0]"],f(cuts.uCutB.value));}
    for(const e of this.entries){gl.bindVertexArray(e.vao);gl.drawArrays(gl.TRIANGLES,0,e.count);}
    gl.bindVertexArray(null);return{drawCalls:this.entries.length,triangles:this.triangles};
  }
  clear(){if(this.disposed)throw Error("Disposed facade shader");for(const e of this.entries){this.gl.deleteVertexArray(e.vao);for(const b of e.buffers)this.gl.deleteBuffer(b);}this.entries=[];this.triangles=0;}
  dispose(){if(this.disposed)return;this.clear();this.gl.deleteProgram(this.program);this.disposed=true;}
}
