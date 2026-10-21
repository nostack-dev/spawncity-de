// Native-only WebGL2 scene renderer: never imports Three.js.
// GPU instancing, mutable buffers, material/texture support, sky+sun lighting,
// alpha sorting, fog, asynchronous GPU timers and loss/recovery.
// TODO for full game release: shadow maps, effects, picking and every
// gameplay scene producer; native-only release gate remains closed.
import {NativeBloomPass} from "./native_bloom_pass.mjs";
import {multiply4,lookAt,perspective,identity4,normalMatrix3} from "./native_render_math.mjs";
import {extractFrustumPlanes,sphereVisible,geometryBoundingSphere,instancedBoundingSphere} from "./native_render_culling.mjs";
import {screenRay,pickNativeMeshes} from "./native_scene_picking.mjs";
import {nativeBuildBvh} from "./native_scene_bvh.mjs";
import {NativeSunShadowMap} from "./native_sun_shadow.mjs";
import {NativeSkyPass} from "./native_sky_pass.mjs";
// Colour arrays baked from the original Three.js models are already linear.
const LINEAR_COLOR_ARRAYS=new WeakSet();
export function markLinearColors(...arrays){for(const a of arrays)if(a&&typeof a==="object")LINEAR_COLOR_ARRAYS.add(a);return arrays[0];}
export const NATIVE_SCENE_RENDERER_VERSION="native-webgl2-sun-shadows-v7-production-facades";
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
"layout(location=14) in vec4 aFacade;",
"uniform int uSkinEnabled,uPaint;",
"uniform mat4 uBones[32];",
"uniform mat4 uViewProjection;",
"out vec3 vWorld,vNormal,vColor;",
"out vec2 vUV,vWallUV;out float vOpacity;out vec4 vFacade;out float vPaint;",
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
"  vPaint=uPaint==1&&aColor.b>aColor.r*2.0&&aColor.b>.08?1.0:0.0;",
"  vColor=vPaint>0.5?iTint.rgb:aColor*iTint.rgb;vOpacity=iTint.a;vUV=aUV;",
"  float wallSpan=abs(aNormal.x)>0.5?length(iModel1.xyz):length(iModel0.xyz);",
"  vWallUV=vec2(aUV.x*wallSpan,aUV.y*length(iModel2.xyz));",
"  vFacade=aFacade;",
"  gl_Position=uViewProjection*p;",
"}"].join("\n");
const FRAG="#version 300 es\n"+[
"precision highp float;",
"precision highp sampler2DShadow;",
"in vec3 vWorld,vNormal,vColor;in vec2 vUV,vWallUV;in float vOpacity;in vec4 vFacade;in float vPaint;",
"uniform vec4 uMaterial;",
"uniform vec3 uSunDirection,uSunColor,uSkyColor,uGroundColor,uEye,uFogColor;",
"uniform float uFogDensity,uExposure,uAlphaCutoff;",
"uniform sampler2D uTexture;",
"uniform sampler2DShadow uSunShadowMap;",
"uniform mat4 uSunShadowProjection;",
"uniform float uSunShadowBias;",
"uniform int uSunShadowEnabled;",
"uniform int uHasTexture,uUnlit,uFacade,uTerrain,uPaint,uLinearColor;",
"uniform vec2 uPbr;",
"uniform float uEnvIntensity;",
"uniform int uPointLightCount;",
"uniform vec4 uPointPosRange[6],uPointColorIntensity[6];",
"// Walkable interiors (native_building_interiors.mjs, production CUTOUT_GLSL):",
"// doorway / roof-hatch openings cut into facade surfaces, and the facade modes",
"// 1 = interior wall (window panes are openings), 2 = interior glass (panes only).",
"uniform int uFacadeMode,uCutN;",
"uniform vec4 uCutA[6],uCutB[6];",
"bool facadeCutout(vec3 P,bool roofHoles){",
"  for(int i=0;i<6;i++){if(i>=uCutN)break;vec4 a=uCutA[i],b=uCutB[i];",
"    if(b.w<0.5){vec2 d=a.zw-a.xy;float L=length(d);vec2 dir=d/max(L,1e-4);vec2 r=P.xy-a.xy;float t=dot(r,dir),s=abs(r.x*dir.y-r.y*dir.x);if(t>0.0&&t<L&&s<b.z&&P.z>b.x&&P.z<b.y)return true;}",
"    else if(roofHoles){vec2 r=P.xy-a.xy,vd=a.zw,ud=vec2(-vd.y,vd.x);float u=dot(r,ud),v=dot(r,vd);if(u>0.0&&u<b.z&&v>0.0&&v<b.w-1.0&&P.z>b.x&&P.z<b.y)return true;}}",
"  return false;}",
"layout(location=0) out vec4 outColor;",
"// Linear pre-tone-map colour for the production neon bloom (native_bloom_pass).",
"layout(location=1) out vec4 outHdr;",
"float fh(float n){return fract(sin(n*127.1)*43758.5453);}",
"float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.55);}",
"float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}",
"vec3 srgbToLinear(vec3 c){return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(0.04045,c));}",
"vec3 linearToSrgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));}",
"// Three r16x ACESFilmicToneMapping (exposure / 0.6, RRT+ODT fit), as production.",
"vec3 rrtOdt(vec3 v){vec3 a=v*(v+0.0245786)-0.000090537;vec3 b=v*(0.983729*v+0.4329510)+0.238081;return a/b;}",
"vec3 acesFilmic(vec3 c){",
" const mat3 inM=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));",
" const mat3 outM=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));",
" c*=uExposure/0.6;c=inM*c;c=rrtOdt(c);c=outM*c;return clamp(c,0.0,1.0);",
"}",
"// Production image-based light: the PMREM of the sky gradient dome over the",
"// 0x5b6450 ground disc (stylized_world_style.mjs buildEnvironment), diffuse.",
"vec3 envIrradiance(vec3 n){",
" vec3 zen=vec3(0.05,0.2,0.62),hor=vec3(0.52,0.66,0.86),gnd=vec3(0.105,0.127,0.084);",
" vec3 sky=mix(hor,zen,0.35);",
" float w=clamp(n.z*0.5+0.5,0.0,1.0);",
" return mix(gnd,sky,smoothstep(0.0,1.0,w));",
"}",
"void main(){",
"  vec4 texel=uHasTexture==1?texture(uTexture,vUV):vec4(1.0);",
"  float alpha=clamp(vOpacity*uMaterial.a*texel.a,0.0,1.0);",
"  if(alpha<uAlphaCutoff)discard;",
"  if(uCutN>0&&vFacade.x!=0.0&&facadeCutout(vWorld,uFacadeMode==0))discard;",
"  // Palette colours are sRGB hex values; meshes baked from the original Three",
"  // models already carry Three's linear colours (paint tints stay sRGB).",
"  vec3 rawBase=max(vec3(0.0),vColor*uMaterial.rgb*texel.rgb);",
"  vec3 base=uLinearColor==1&&vPaint<0.5?rawBase:srgbToLinear(rawBase);",
"  vec3 n=normalize(vNormal),sun=normalize(uSunDirection);",
"  if(uFacade==1&&vFacade.x==0.0&&abs(n.z)<0.6){",
"    float floorH=3.2;",
"    float floorIndex=floor(max(vWallUV.y,0.0)/floorH);",
"    float yIn=fract(max(vWallUV.y,0.0)/floorH);",
"    vec2 cell=vec2(fract(vWallUV.x/2.55),yIn);",
"    vec2 fw=max(fwidth(vec2(vWallUV.x/2.55,vWallUV.y/floorH)),vec2(0.008));",
"    float groundFloor=step(floorIndex,0.0);",
"    float inset=mix(.22,.16,groundFloor);",
"    float wx=smoothstep(inset,inset+fw.x,cell.x)*(1.0-smoothstep(1.0-inset-fw.x,1.0-inset,cell.x));",
"    float wy=smoothstep(.30,.30+fw.y,cell.y)*(1.0-smoothstep(.78-fw.y,.82,cell.y));",
"    float farFade=1.0-smoothstep(.07,.26,max(fw.x,fw.y));",
"    float glass=wx*wy*farFade;",
"    float sunLit=clamp(dot(n,sun)*.65+.22,0.0,1.0);",
"    vec3 pane=mix(vec3(.04,.07,.1),vec3(.78,.9,.96),sunLit);",
"    pane*=.7+.3*fract(sin(floorIndex*12.9898+vWallUV.x*.17)*43758.5453);",
"    base=mix(base,pane,glass);",
"    float sill=exp(-pow((cell.y-.28)/.035,2.0))*farFade*(1.0-groundFloor);",
"    base=mix(base,base*1.15+vec3(.05,.045,.04),sill);",
"    float store=groundFloor*smoothstep(.08,.2,cell.y)*farFade;",
"    base=mix(base,base*.72+vec3(.02,.015,.01),store*.35);",
"  }",
"  if(n.z>.82){",
"    vec2 tile=fract(vWorld.xy*.42);",
"    float seam=smoothstep(.0,.04,tile.x)*smoothstep(.0,.04,tile.y);",
"    base*=.9+.1*seam;",
"  }",
"  // Production ground (stylized_world_style.mjs realGround): large-scale",
"  // value noise between dry and lush grass, with soil patches. No grid.",
"  if(uTerrain==1){",
"    float n1=gn(vWorld.xy*.015)*.6+gn(vWorld.xy*.08)*.3+gn(vWorld.xy*.6)*.1;",
"    base*=mix(vec3(.78,.84,.7),vec3(1.12,1.06,.86),n1);",
"    base=mix(base,srgbToLinear(vec3(.42,.36,.27)),smoothstep(.62,.8,gn(vWorld.xy*.03+7.0))*.45);",
"  }",
"  // Production facades (world_city_buildings.mjs FACADE_GLSL): ground-floor",
"  // shop band with storefront glass and awnings, framed windows with sills,",
"  // glass curtain walls on towers, pilasters, grime near the ground.",
"  float facGlass=0.0;vec3 baseIn=base;",
"  if(vFacade.x>0.0&&abs(n.z)<0.5){",
"    float sdq=floor(vFacade.z*997.0+0.5)/997.0;",
"    float u=vUV.x,len=vFacade.x,z=vUV.y,H=vFacade.y,floorH=vFacade.w;",
"    vec3 glassC=vec3(0.2,0.26,0.32);",
"    float aa=clamp(1.6-fwidth(u)*1.2,0.0,1.0);",
"    float pil=1.0-step(0.38,u)*step(u,len-0.38);",
"    float tower=step(26.0,H);",
"    float pitch=mix(2.7,3.7,fh(sdq*7.0));",
"    float nWin=max(1.0,floor((len-0.8)/pitch)),margin=(len-nWin*pitch)*0.5;",
"    float lu=(u-margin)/pitch,fu=fract(lu),inRow=step(0.0,lu)*step(lu,nWin);",
"    float gl=0.0;",
"    if(z<4.0&&len>3.0){",
"      float sp=4.4,ns=max(1.0,floor(len/sp)),sm=(len-ns*sp)*0.5,su=fract((u-sm)/sp),inS=step(0.0,u-sm)*step(u-sm,ns*sp);",
"      float win=inS*step(.08,su)*step(su,.92)*step(.35,z)*step(z,3.0);",
"      float frame=inS*step(.05,su)*step(su,.95)*step(.25,z)*step(z,3.1)-win;",
"      base=mix(base*0.9,vec3(0.12,0.12,0.13),frame*aa);gl=win*aa;",
"      float k=fh(sdq*11.0);vec3 awn=k<.25?vec3(0.45,0.09,0.07):k<.5?vec3(0.08,0.24,0.15):k<.75?vec3(0.08,0.15,0.32):vec3(0.5,0.36,0.08);",
"      float aw=step(3.15,z)*step(z,3.75)*aa;base=mix(base,awn*mix(1.0,1.15,step(0.5,fract(u*1.4))),aw);",
"      base=mix(base,base*0.78,step(3.75,z)*step(z,4.0));",
"    }else if(tower>0.5){",
"      float fz=fract((z-4.0)/floorH),mull=step(.95,fract(u/1.6)),spandrel=step(.8,fz);",
"      gl=(1.0-spandrel)*(1.0-mull)*aa*(1.0-pil);base=mix(base,base*0.85,spandrel*aa);",
"    }else{",
"      float fz=fract((z-4.0)/floorH);",
"      float ww=mix(.38,.6,fh(sdq*5.0)),wh=mix(.42,.6,fh(sdq*9.0)),inTop=step(z,H-1.2);",
"      float win=inRow*inTop*step(.5-ww*.5,fu)*step(fu,.5+ww*.5)*step(.3,fz)*step(fz,.3+wh);",
"      float frame=inRow*inTop*step(.5-ww*.5-.05,fu)*step(fu,.5+ww*.5+.05)*step(.25,fz)*step(fz,.35+wh)-win;",
"      float sill=inRow*inTop*step(.5-ww*.5-.09,fu)*step(fu,.5+ww*.5+.09)*step(.2,fz)*step(fz,.25);",
"      vec3 frameC=fh(sdq*17.0)<.5?vec3(0.85,0.84,0.8):vec3(0.14,0.14,0.15);",
"      base=mix(base,frameC,frame*aa);base=mix(base,base*1.12+0.04,sill*aa);gl=win*aa;",
"      base*=1.0-0.08*step(.965,fz)*aa;",
"    }",
"    base=mix(base,base*0.86,pil*aa);",
"    base=mix(base,glassC,gl);facGlass=gl;",
"    base*=mix(0.72,1.0,smoothstep(0.0,2.5,z));",
"  }else if(vFacade.x<-0.5&&vFacade.x>-1.5&&n.z>0.5){",
"    float t=fract(sin(dot(floor(vWorld.xy*0.7),vec2(12.99,78.23)))*43758.5);base*=0.88+0.12*t;",
"  }",
"  if(uFacadeMode==1){if(facGlass>0.5)discard;base=baseIn;facGlass=0.0;}",
"  else if(uFacadeMode==2){if(facGlass<0.5)discard;alpha=0.10+0.45*pow(1.0-abs(dot(normalize(uEye-vWorld),n)),3.0);}",
"  float ndl=max(dot(n,sun),0.0);",
"  vec3 hemis=mix(uGroundColor,uSkyColor,clamp(n.z*0.5+0.5,0.0,1.0));",
"  float shadow=1.0;",
"  if(uSunShadowEnabled==1&&ndl>0.0){",
"   vec4 clip=uSunShadowProjection*vec4(vWorld,1.0);",
"   vec3 uvz=clip.xyz/clip.w*0.5+0.5;",
"   if(uvz.x>0.0&&uvz.x<1.0&&uvz.y>0.0&&uvz.y<1.0&&uvz.z>0.0)",
"    shadow=texture(uSunShadowMap,vec3(uvz.xy,uvz.z-uSunShadowBias));",

"  }",
"  vec3 point=vec3(0.0);",
"  if(uUnlit!=1){",
"   for(int i=0;i<6;i++){",
"    if(i>=uPointLightCount)break;",
"    vec3 delta=uPointPosRange[i].xyz-vWorld;",
"    float d2=max(dot(delta,delta),0.04);",
"    float radius=max(0.1,uPointPosRange[i].w);",
"    float attenuation=pow(max(0.0,1.0-d2/(radius*radius)),2.0)/(1.0+d2/(radius*radius));",
"    float diffuse=max(dot(n,delta*inversesqrt(d2)),0.0);",
"    point+=uPointColorIntensity[i].rgb*(uPointColorIntensity[i].a*0.12)*attenuation*diffuse;",
"   }",
"  }",
"  // Production MeshStandardMaterial lighting (Three r16x, physical units):",
"  // Lambert BRDF albedo/PI for the sun and hemisphere light, plus the sky",
"  // IBL at environmentIntensity 0.9. Unlit materials keep their colour.",
"  const float PI=3.141592653589793;",
"  float rough=clamp(uPbr.x,0.04,1.0),metal=clamp(uPbr.y,0.0,1.0);",
"  vec3 rgb=uUnlit==1?base:base*(1.0-metal)*((uSunColor*ndl*shadow+hemis+point*PI)/PI+envIrradiance(n)*uEnvIntensity);",
"  if(uUnlit!=1&&(metal>0.0||rough<0.95)){",
"    // MeshStandardMaterial specular: Schlick Fresnel with roughness against",
"    // the sky environment, plus a GGX-shaped sun highlight.",
"    vec3 V=normalize(uEye-vWorld),R=reflect(-V,n);",
"    float NdV=clamp(dot(n,V),0.0,1.0);",
"    vec3 F0=mix(vec3(0.04),base,metal);",
"    vec3 F=F0+(max(vec3(1.0-rough),F0)-F0)*pow(1.0-NdV,5.0);",
"    vec3 envR=mix(envIrradiance(R),mix(vec3(0.52,0.66,0.86),vec3(0.05,0.2,0.62),clamp(R.z,0.0,1.0)),1.0-rough);",
"    rgb+=F*envR*uEnvIntensity;",
"    vec3 H=normalize(sun+V);float a2=rough*rough*rough*rough;float NdH=clamp(dot(n,H),0.0,1.0);",
"    float d=a2/(PI*pow(NdH*NdH*(a2-1.0)+1.0,2.0));",
"    rgb+=F*uSunColor*ndl*shadow*min(d,40.0)*0.25;",
"  }",
"  // Glass mirrors the sky (production: smooth, partly metallic PBR glass",
"  // plus a Fresnel sky term), so windows read light, not black.",
"  if(facGlass>0.0){",
"    vec3 V=normalize(uEye-vWorld);float fr=pow(1.0-abs(dot(V,n)),3.0);",
"    vec3 skyRefl=mix(vec3(0.52,0.66,0.86),vec3(0.05,0.2,0.62),clamp(reflect(-V,n).z,0.0,1.0)*0.6)*uEnvIntensity;",
"    rgb=mix(rgb,skyRefl,facGlass*(0.45+0.4*fr));",
"    rgb+=facGlass*mix(vec3(0.05,0.07,0.09),vec3(0.32,0.4,0.5),fr);",
"  }",
"  // Production grade (stylized_world_style.mjs CustomToneMapping), then sRGB.",
"  outHdr=vec4(max(rgb,vec3(0.0)),alpha);",
"  rgb=acesFilmic(rgb);",
"  float luma=dot(rgb,vec3(0.2126,0.7152,0.0722));",
"  rgb=mix(vec3(luma),rgb,1.14);",
"  rgb=mix(rgb,rgb*rgb*(3.0-2.0*rgb),0.22);",
"  rgb+=vec3(0.016,0.006,-0.014)*smoothstep(0.35,1.0,luma)+vec3(-0.006,0.0,0.012)*(1.0-smoothstep(0.0,0.3,luma));",
"  rgb=linearToSrgb(clamp(rgb,0.0,1.0));",
"  // Three applies FogExp2 after the colour-space conversion.",
"  float fog=1.0-exp(-pow(uFogDensity*length(vWorld-uEye),2.0));",
"  rgb=mix(rgb,uFogColor,clamp(fog,0.0,1.0));",
"  outColor=vec4(clamp(rgb,0.0,1.0),alpha);",
"}"].join("\n");
function typed(name,data,n){
 if(!(data instanceof Float32Array)||data.length%n)throw Error(name+" requires Float32Array / "+n);
 return data;
}
function castsShadow(m){
 return m.material?.castShadow!==false&&m.material?.alphaMode!=="blend"&&m.material?.alphaMode!=="mask";
}
function asMatrices(data){
 if(data instanceof Float32Array&&data.length&&data.length%16===0)return data;
 if(data?.length&&data[0]?.length===16){
  const out=new Float32Array(data.length*16);
  for(let i=0;i<data.length;i++)if(data[i]?.length===16)out.set(data[i],i*16);
  return out;
 }
 if(data?.length&&data.length%16===0)return new Float32Array(data);
 return null;
}
function instances(input){
 const transforms=asMatrices(input?.transforms)??identity4();
 if(!transforms.length)throw Error("empty instances");
 const count=transforms.length/16;
 const tints=input?.tints??new Float32Array(count*4).fill(1);
 const tintBuf=tints instanceof Float32Array&&tints.length===count*4?tints:new Float32Array(count*4).fill(1);
 const normals=new Float32Array(count*9);
 for(let k=0;k<count;k++){
   const mat=transforms.subarray(k*16,k*16+16),normal=normalMatrix3(mat);
   normals.set(normal,k*9);
 }
 // Per-instance normal matrices. Named apart from the per-vertex normals: a
 // shared key let the instance array overwrite the vertex normal attribute.
 return {transforms,tints:tintBuf,instanceNormals:normals,count};
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
 let facade=null;
 if(input.facade){facade=typed("facade",input.facade,4);if(facade.length!==count*4)throw Error("facade attribute count mismatch");}
 const linearColors=LINEAR_COLOR_ARRAYS.has(input.colors);
 return {p,normals,colors,uvs,facade,linearColors,indices,skin,...instances(input.instances)};
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
 const uniforms=["uViewProjection","uMaterial","uLinearColor","uPbr","uEnvIntensity","uSunDirection","uSunColor","uSkyColor","uGroundColor","uEye","uFogColor","uFogDensity","uExposure","uAlphaCutoff","uTexture","uHasTexture","uUnlit","uFacade","uTerrain","uPaint","uSkinEnabled","uBones[0]","uSunShadowMap","uSunShadowProjection","uSunShadowBias","uSunShadowEnabled","uPointLightCount","uPointPosRange[0]","uPointColorIntensity[0]","uFacadeMode","uCutN","uCutA[0]","uCutB[0]"];
 return {handle:p,u:Object.fromEntries(uniforms.map(k=>[k,gl.getUniformLocation(p,k)]))};
}
export class NativeSceneRenderer{
 constructor(canvas,{width=canvas?.width??960,height=canvas?.height??540,shadows=null}={}){
  if(!canvas?.getContext)throw Error("Canvas required");
  this.canvas=canvas;
  this.gl=canvas.getContext("webgl2",{alpha:false,antialias:false,depth:true,powerPreference:"high-performance",preserveDrawingBuffer:false});
  if(!this.gl)throw Error("Native WebGL2 required; no Three/WebGL1 fallback");
  this.meshes=new Map();this.lost=false;this.disposed=false;
  this.eye=[0,-18,8];this.target=[0,0,2];this.up=[0,0,1];
  this.fov=Math.PI/3;this.near=.05;this.far=1800;
  this.sunDirection=[-.45,-.52,.72];
  // Production day: sun 0xfff2e0 at 2.8, hemisphere 0xc4dcff / 0x6b5e48 at 0.85.
  // Linear light colours x intensity, as Three uploads them: sun 0xfff2e0 x2.8,
  // hemisphere 0xc4dcff / 0x6b5e48 x0.85, FogExp2 0xb7c9dc at .00085, exposure 1.
  this.sunColor=[2.8,2.47,2.11];
  this.skyColor=[.469,.609,.85];this.groundColor=[.125,.094,.054];
  this.fogColor=[.474,.584,.716];
  this.fogDensity=.00085;this.exposure=1;this.stats=null;
  this.pointLights={count:0,posRange:new Float32Array(24),colorIntensity:new Float32Array(24)};
  this.facadeCuts={count:0,a:new Float32Array(24),b:new Float32Array(24)};
  this.shadow=null;this.shadowConfig=shadows&&shadows!==false?{...shadows}:null;
  this.sceneRevision=0;this.shadowRevision=0;this.shadowCache=null;
  this.onLost=e=>{e.preventDefault();this.lost=true;this.bloom?.dispose({contextLost:true});this.shadow?.dispose({contextLost:true});this.sky?.dispose({contextLost:true});this.shadow=null;this.shadowCache=null;};
  this.onRestored=()=>{this.lost=false;this.init();for(const m of this.meshes.values())this.upload(m);};
  canvas.addEventListener?.("webglcontextlost",this.onLost,false);
  canvas.addEventListener?.("webglcontextrestored",this.onRestored,false);
  this.init();this.resize(width,height);
 }
 init(){
  this.gpu=program(this.gl);
  this.sky=new NativeSkyPass(this.gl);
  this.bloom??=new NativeBloomPass(this.gl);
  this.timer=this.gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if(this.shadowConfig)this.shadow=new NativeSunShadowMap(this.gl,this.shadowConfig);
  this.shadowCache=null;
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
 getScreenRay(x,y){
  return screenRay({eye:this.eye,target:this.target,up:this.up,fov:this.fov,near:this.near,far:this.far},x,y,this.width,this.height);
 }
 pick(x,y,{maxDistance=this.far,ignoreId=null}={}){
  return pickNativeMeshes(this.meshes,this.getScreenRay(x,y),{maxDistance,ignoreId});
 }
 setShadows(options=null){
  if(this.disposed)throw Error("renderer disposed");
  this.shadow?.dispose({contextLost:this.lost});this.shadow=null;this.shadowCache=null;
  this.shadowConfig=options&&options!==false?{...options}:null;
  if(this.shadowConfig&&!this.lost)this.shadow=new NativeSunShadowMap(this.gl,this.shadowConfig);
 }
 setLighting(values={}){
  for(const key of ["sunDirection","sunColor","skyColor","groundColor","fogColor","fogDensity","exposure"])
   if(values[key]!==undefined)this[key]=Array.isArray(values[key])?[...values[key]]:values[key];
 }
 setPointLights(frame){
  if(this.disposed)throw Error("native renderer disposed");
  if(!frame||!Number.isInteger(frame.count)||frame.count<0||frame.count>6
   ||!(frame.posRange instanceof Float32Array)||frame.posRange.length!==24
   ||!(frame.colorIntensity instanceof Float32Array)||frame.colorIntensity.length!==24
   ||!frame.posRange.every(Number.isFinite)||!frame.colorIntensity.every(Number.isFinite))
   throw Error("invalid native point light data");
  // The producer reuses its buffers each frame. Copy so a late render reads
  // the state it was explicitly handed, never mutated request data.
  this.pointLights??={count:0,posRange:new Float32Array(24),colorIntensity:new Float32Array(24)};
  this.pointLights.count=frame.count;
  this.pointLights.posRange.set(frame.posRange);
  this.pointLights.colorIntensity.set(frame.colorIntensity);
 }
 // Facade openings (doorways, roof hatch) of the walkable building:
 // [{a:[x0,y0,x1,y1]|[ox,oy,vx,vy],b:[z0,z1,halfWidth|W,0|L+1]}], at most 6.
 setFacadeCutouts(list=[]){
  const cuts=this.facadeCuts??={count:0,a:new Float32Array(24),b:new Float32Array(24)};
  const rows=(Array.isArray(list)?list:[]).filter(c=>c?.a?.length===4&&c?.b?.length===4&&[...c.a,...c.b].every(Number.isFinite)).slice(0,6);
  cuts.a.fill(0);cuts.b.fill(0);rows.forEach((c,i)=>{cuts.a.set(c.a,i*4);cuts.b.set(c.b,i*4);});
  cuts.count=rows.length;this.sceneRevision++;return rows.length;
 }
 upsert(id,input){
  if(this.disposed)throw Error("disposed");
  if(typeof id!=="string"||!id.trim())throw Error("mesh needs ID");
  // Stage the replacement completely before touching the live GPU object.
  // An invalid geometry, bad bounds or allocation failure must not erase a
  // previously rendered city tile/vehicle or leave a freed VAO in the scene.
  const m={id,data:validate(input),material:{color:[1,1,1,1],alphaMode:"opaque",unlit:false,doubleSided:false,...input.material},texture:input.texture||null,visible:input.visible!==false};
  m.localBounds=geometryBoundingSphere(m.data.p);
  // Static world-space indexed tiles are already in absolute Box3D metres.
  // Build a BVH once; moving/animated meshes keep the exact brute-force path.
  const isIdentity=m.data.count===1&&m.data.transforms.every((x,i)=>x===((i%5===0)?1:0));
  const triangleCount=(m.data.indices?.length||m.data.p.length/3)/3;
  m.bvh=isIdentity&&!m.data.skin&&triangleCount>=36?nativeBuildBvh(m.data.p,m.data.indices):null;
  m.worldBounds=instancedBoundingSphere(m.localBounds,m.data.transforms);
  if(!this.lost){
   try{this.upload(m);}
   catch(error){this.free(m);throw error;}
  }
  const old=this.meshes.get(id);
  if(old)this.free(old);
  this.meshes.set(id,m);this.sceneRevision++;
  if(castsShadow(m)||(old&&castsShadow(old)))this.shadowRevision++;
  return m;
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
  const normal=gl.createBuffer();m.buffers.push(normal);gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,d.instanceNormals,gl.DYNAMIC_DRAW);
  for(let i=0;i<3;i++){const loc=9+i;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);gl.vertexAttribDivisor(loc,1);}
  m.capTransforms=d.transforms.length;m.capTints=d.tints.length;m.capNormals=d.instanceNormals.length;
  if(d.skin){
    for(const [loc,values]of [[12,d.skin.joints],[13,d.skin.weights]]){
      const buffer=gl.createBuffer();m.buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,4,gl.FLOAT,false,0,0);
    }
  }
  if(d.facade){
    const buffer=gl.createBuffer();m.buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,d.facade,gl.STATIC_DRAW);gl.enableVertexAttribArray(14);
    gl.vertexAttribPointer(14,4,gl.FLOAT,false,0,0);
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
  const next=instances(newInstances);
  const prev=m.data;
  const same=(a,b)=>a!==b&&a.length===b.length&&a.every((value,i)=>value===b[i]);
  if(same(prev.transforms,next.transforms)&&same(prev.tints,next.tints))return false;
  // Validate all world bounds before touching any of the GPU buffers.
  // Failed uploads must not advance the CPU scene revision, hit indices, or
  // stale shadow geometry while the renderer still draws the old instances.
  const nextBounds=instancedBoundingSphere(m.localBounds,next.transforms);
  if(!this.lost){
   const gl=this.gl,slots=[
    [4,next.transforms,prev.transforms,"capTransforms"],
    [5,next.tints,prev.tints,"capTints"],
    [6,next.instanceNormals,prev.instanceNormals,"capNormals"]
   ];
   try{
    for(const [slot,data,,cap] of slots){
     gl.bindBuffer(gl.ARRAY_BUFFER,m.buffers[slot]);
     // Geometric capacity avoids reallocating when traffic count oscillates.
     if(data.length>m[cap]){
      m[cap]=Math.max(data.length,(m[cap]||0)*2);
      gl.bufferData(gl.ARRAY_BUFFER,m[cap]*Float32Array.BYTES_PER_ELEMENT,gl.DYNAMIC_DRAW);
     }
     gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
    }
   }catch(error){
    // Exceptional slow path only: restore all old GPU contents and capacities
    // after a partial driver upload. Without this, a failed car reorder can
    // make the displayed instance differ from the authoritative Box3D hit ID.
    try{
     for(const [slot,,previous,cap] of slots){
      gl.bindBuffer(gl.ARRAY_BUFFER,m.buffers[slot]);
      gl.bufferData(gl.ARRAY_BUFFER,previous,gl.DYNAMIC_DRAW);
      m[cap]=previous.length;
     }
    }catch(restoreError){
     throw new Error("native GPU instance rollback failed; stop presentation",{cause:restoreError});
    }
    throw error;
   }finally{
    gl.bindBuffer(gl.ARRAY_BUFFER,null);
   }
  }
  Object.assign(m.data,next);
  m.worldBounds=nextBounds;m.bvh=null;this.sceneRevision++;
  if(castsShadow(m))this.shadowRevision++;
  return true;
 }
 updateBones(id,bones){
  const m=this.meshes.get(id);if(!m?.data.skin)throw Error("not a skinned mesh "+id);
  typed("skin bones",bones,16);
  if(bones.length!==m.data.skin.bones.length)throw Error("joint count cannot change without rebuilding mesh");
  m.data.skin.bones=bones;this.sceneRevision++;
  if(castsShadow(m))this.shadowRevision++;
 }
 free(m){
  if(!this.lost){if(m.vao)this.gl.deleteVertexArray(m.vao);for(const b of m.buffers||[])this.gl.deleteBuffer(b);if(m.element)this.gl.deleteBuffer(m.element);}
  m.vao=null;m.buffers=[];m.element=null;
 }
 setVisible(id,visible){
  const m=this.meshes.get(id);
  if(!m)return false;
  const requested=visible!==false;
  if(m.visible===requested)return false;
  m.visible=requested;
  this.sceneRevision++;
  if(castsShadow(m))this.shadowRevision++;
  return true;
 }
 remove(id){const m=this.meshes.get(id);if(!m)return false;this.free(m);this.meshes.delete(id);this.sceneRevision++;if(castsShadow(m))this.shadowRevision++;return true;}
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
 render({clearColor=[.045,.07,.12,1],viewport=null}={}){
  if(this.disposed)throw Error("disposed native scene");
  if(this.lost)throw Error("native GL context lost; waiting for native restoration");
  const gl=this.gl,start=performance.now(),u=this.gpu.u;this.pollGpu();
  let timerQuery=null;
  if(this.timer&&this.pending.length<4){timerQuery=gl.createQuery();gl.beginQuery(this.timer.TIME_ELAPSED_EXT,timerQuery);}
  let shadowStats=null;
  if(this.shadow){
   const key=this.shadowRevision+"|"+this.target.join(",")+"|"+this.sunDirection.join(",");
   if(this.shadowCache?.key===key)shadowStats={drawCalls:0,resolution:this.shadow.resolution,reused:true};
   else{shadowStats=this.shadow.draw(this.meshes.values(),{focus:this.target,sunDirection:this.sunDirection});this.shadowCache={key};}
  }
  // Each stereo eye shares ONE native drawing buffer. Scissor all clears
  // and shader draws so left/right views never erase each other.
  const rect=viewport??{x:0,y:0,width:this.width,height:this.height};
  if(![rect.x,rect.y,rect.width,rect.height].every(Number.isInteger)
    ||rect.width<1||rect.height<1||rect.x<0||rect.y<0
    ||rect.x+rect.width>this.width||rect.y+rect.height>this.height)
   throw Error("native viewport must fit inside the drawing buffer");
  if(viewport){gl.enable(gl.SCISSOR_TEST);gl.scissor(rect.x,rect.y,rect.width,rect.height);}
  else gl.disable(gl.SCISSOR_TEST);
  // Production neon bloom: the scene goes into the bloom target (plain
  // path for stereo eyes / when the device cannot run it).
  const post=!viewport&&Boolean(this.bloom?.begin(this.width,this.height));
  gl.viewport(rect.x,rect.y,rect.width,rect.height);
  gl.clearColor(...clearColor);gl.clearDepth(1);gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  this.sky.draw({eye:this.eye,target:this.target,up:this.up,fov:this.fov,aspect:rect.width/rect.height,
   sun:this.skySun||this.sunDirection,moon:this.skyMoon||undefined,night:this.night||0,exposure:this.exposure});
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.BLEND);gl.useProgram(this.gpu.handle);
  const camera=multiply4(perspective(this.fov,rect.width/rect.height,this.near,this.far),lookAt(this.eye,this.target,this.up));
  gl.uniformMatrix4fv(u.uViewProjection,false,camera);
  for(const key of ["sunDirection","sunColor","skyColor","groundColor","fogColor","eye"])
   gl.uniform3fv(u["u"+key[0].toUpperCase()+key.slice(1)],new Float32Array(this[key]));
  gl.uniform1f(u.uFogDensity,this.fogDensity);gl.uniform1f(u.uExposure,this.exposure);gl.uniform1f(u.uEnvIntensity,Number.isFinite(this.envIntensity)?this.envIntensity:.9);gl.uniform1i(u.uTexture,0);
  gl.uniform1i(u.uPointLightCount,this.pointLights.count);
  gl.uniform4fv(u["uPointPosRange[0]"],this.pointLights.posRange);
  gl.uniform4fv(u["uPointColorIntensity[0]"],this.pointLights.colorIntensity);
  {const cuts=this.facadeCuts;gl.uniform1i(u.uCutN,cuts?.count||0);if(cuts?.count){gl.uniform4fv(u["uCutA[0]"],cuts.a);gl.uniform4fv(u["uCutB[0]"],cuts.b);}}
  gl.uniform1i(u.uSunShadowEnabled,this.shadow?1:0);gl.uniform1i(u.uSunShadowMap,1);
  if(this.shadow){
   gl.uniformMatrix4fv(u.uSunShadowProjection,false,this.shadow.matrix);
   gl.uniform1f(u.uSunShadowBias,this.shadow.bias);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shadow.depth);gl.activeTexture(gl.TEXTURE0);
  }
  const planes=extractFrustumPlanes(camera);
  const meshes=[...this.meshes.values()].filter(m=>{
    if(!m.visible)return false;
    if(m.data.skin||m.material.frustumCulled===false)return true;
    const b=m.worldBounds;if(!b?.center||!(b.radius>=0))return true;
    return sphereVisible(planes,b.center,b.radius);
  });
  const opaque=meshes.filter(m=>m.material.alphaMode!=="blend"&&m.material.viewmodel!==true);
  const viewmodel=meshes.filter(m=>m.material.viewmodel===true);
  const transparent=meshes.filter(m=>m.material.alphaMode==="blend"&&m.material.viewmodel!==true);
  transparent.sort((a,b)=>{
   const x=a.data.transforms,y=b.data.transforms;
   return Math.hypot(y[12]-this.eye[0],y[13]-this.eye[1],y[14]-this.eye[2])-Math.hypot(x[12]-this.eye[0],x[13]-this.eye[1],x[14]-this.eye[2]);
  });
  const stats={drawCalls:0,shadowDrawCalls:shadowStats?.drawCalls||0,shadowResolution:shadowStats?.resolution||0,shadowReused:Boolean(shadowStats?.reused),triangles:0,instances:0,culledMeshes:this.meshes.size-meshes.length,cpuMs:0,gpuMs:this.lastGpuMs};
  const draw=m=>{
   const d=m.data,mat=m.material;
   gl.uniform4fv(u.uMaterial,new Float32Array(mat.color));
   gl.uniform1f(u.uAlphaCutoff,mat.alphaMode==="mask"?(mat.alphaCutoff??.5):0);
   gl.uniform1i(u.uUnlit,mat.unlit?1:0);gl.uniform1i(u.uFacade,mat.facade?1:0);gl.uniform1i(u.uFacadeMode,mat.facadeMode|0);
   gl.uniform1i(u.uLinearColor,m.data.linearColors||mat.linearColors?1:0);
   gl.uniform2f(u.uPbr,Number.isFinite(mat.roughness)?mat.roughness:1,Number.isFinite(mat.metalness)?mat.metalness:0);
   gl.uniform1i(u.uTerrain,mat.terrain?1:0);gl.uniform1i(u.uPaint,mat.paint?1:0);gl.uniform1i(u.uHasTexture,m.texture?1:0);
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
  gl.depthMask(true);gl.disable(gl.BLEND);
  // Same contract as viewmodel_pass.mjs: the weapon is drawn last, after a
  // depth clear, so a wall against the camera cannot cut the gun.
  if(viewmodel.length){gl.clear(gl.DEPTH_BUFFER_BIT);for(const m of viewmodel)draw(m);}
  gl.bindVertexArray(null);
  if(post){this.bloom.end(this.exposure);gl.useProgram(this.gpu.handle);gl.enable(gl.DEPTH_TEST);gl.viewport(rect.x,rect.y,rect.width,rect.height);}
  if(viewport)gl.disable(gl.SCISSOR_TEST);
  if(timerQuery){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pending.push(timerQuery);}
  stats.cpuMs=+(performance.now()-start).toFixed(3);this.stats=stats;return stats;
 }
 dispose(){
  if(this.disposed)return;
  for(const m of this.meshes.values())this.free(m);
  this.meshes.clear();if(!this.lost){for(const q of this.pending)this.gl.deleteQuery(q);this.gl.deleteProgram(this.gpu.handle);}
  this.pending=[];this.shadow?.dispose({contextLost:this.lost});this.shadow=null;
  this.sky?.dispose({contextLost:this.lost});this.sky=null;this.disposed=true;this.canvas.removeEventListener?.("webglcontextlost",this.onLost);this.canvas.removeEventListener?.("webglcontextrestored",this.onRestored);
 }
}
