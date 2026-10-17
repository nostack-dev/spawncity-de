import * as THREE from "three";
// Shared, side-effect-free facade contract: no city renderer bootstrap.
export const MAX_FACADE_CUTOUTS=6;
export const facadeCutouts={uCutN:{value:0},uCutA:{value:Array.from({length:MAX_FACADE_CUTOUTS},()=>new THREE.Vector4())},uCutB:{value:Array.from({length:MAX_FACADE_CUTOUTS},()=>new THREE.Vector4())}};
export const CUTOUT_GLSL=`uniform int uCutN;uniform vec4 uCutA[${MAX_FACADE_CUTOUTS}];uniform vec4 uCutB[${MAX_FACADE_CUTOUTS}];
bool facadeCutout(vec3 P,bool roofHoles){
  for(int i=0;i<${MAX_FACADE_CUTOUTS};i++){if(i>=uCutN)break;vec4 a=uCutA[i],b=uCutB[i];
    if(b.w<0.5){vec2 d=a.zw-a.xy;float L=length(d);vec2 dir=d/max(L,1e-4);vec2 r=P.xy-a.xy;float t=dot(r,dir),s=abs(r.x*dir.y-r.y*dir.x);if(t>0.0&&t<L&&s<b.z&&P.z>b.x&&P.z<b.y)return true;}
    else if(roofHoles){vec2 r=P.xy-a.xy,vd=a.zw,ud=vec2(-vd.y,vd.x);float u=dot(r,ud),v=dot(r,vd);if(u>0.0&&u<b.z&&v>0.0&&v<b.w-1.0&&P.z>b.x&&P.z<b.y)return true;}}
  return false;}`;

export const FACADE_GLSL=`{
  float sdq=floor(vSeed*997.0+0.5)/997.0; // per-building seed, snapped: interpolation noise must not change the hash (speckle/flicker)
  vec3 wn=normalize(cross(dFdx(vWinPos),dFdy(vWinPos)));
  vec3 base=diffuseColor.rgb;
  float u=vWall.x,len=vWall.y,z=vWall.z,H=vWall.w;
  if(u>=0.0&&abs(wn.z)<0.5){
    vec3 glassC=vec3(0.2,0.26,0.32);
    float aa=clamp(1.6-fwidth(u)*1.2,0.0,1.0);
    float pil=1.0-step(0.38,u)*step(u,len-0.38);
    float tower=step(26.0,H);
    float pitch=mix(2.7,3.7,fh(sdq*7.0)),floorH=vFloorH;
    float nWin=max(1.0,floor((len-0.8)/pitch)),margin=(len-nWin*pitch)*0.5;
    float lu=(u-margin)/pitch,fu=fract(lu),inRow=step(0.0,lu)*step(lu,nWin);
    float gl=0.0,trimM=0.0;
    if(z<4.0&&len>3.0){
      float sp=4.4,ns=max(1.0,floor(len/sp)),sm=(len-ns*sp)*0.5,su=fract((u-sm)/sp),inS=step(0.0,u-sm)*step(u-sm,ns*sp);
      float win=inS*step(.08,su)*step(su,.92)*step(.35,z)*step(z,3.0);
      float frame=inS*step(.05,su)*step(su,.95)*step(.25,z)*step(z,3.1)-win;
      base=mix(base*0.9,vec3(0.12,0.12,0.13),frame*aa);trimM=frame;gl=win*aa;
      float k=fh(sdq*11.0);vec3 awn=k<.25?vec3(0.45,0.09,0.07):k<.5?vec3(0.08,0.24,0.15):k<.75?vec3(0.08,0.15,0.32):vec3(0.5,0.36,0.08);
      float aw=step(3.15,z)*step(z,3.75)*aa;base=mix(base,awn*mix(1.0,1.15,step(0.5,fract(u*1.4))),aw);
      base=mix(base,base*0.78,step(3.75,z)*step(z,4.0));
    }else if(tower>0.5){
      float fz=fract((z-4.0)/floorH),mull=step(.95,fract(u/1.6)),spandrel=step(.8,fz);
      gl=(1.0-spandrel)*(1.0-mull)*aa*(1.0-pil);base=mix(base,base*0.85,spandrel*aa);trimM=mull;
    }else{
      float fz=fract((z-4.0)/floorH);
      float ww=mix(.38,.6,fh(sdq*5.0)),wh=mix(.42,.6,fh(sdq*9.0)),inTop=step(z,H-1.2);
      float win=inRow*inTop*step(.5-ww*.5,fu)*step(fu,.5+ww*.5)*step(.3,fz)*step(fz,.3+wh);
      float frame=inRow*inTop*step(.5-ww*.5-.05,fu)*step(fu,.5+ww*.5+.05)*step(.25,fz)*step(fz,.35+wh)-win;
      float sill=inRow*inTop*step(.5-ww*.5-.09,fu)*step(fu,.5+ww*.5+.09)*step(.2,fz)*step(fz,.25);
      vec3 frameC=fh(sdq*17.0)<.5?vec3(0.85,0.84,0.8):vec3(0.14,0.14,0.15);
      base=mix(base,frameC,frame*aa);base=mix(base,base*1.12+0.04,sill*aa);trimM=frame+sill;gl=win*aa;
      base*=1.0-0.08*step(.965,fz)*aa;
    }
    base=mix(base,base*0.86,pil*aa);
    base=mix(base,glassC,gl);facGlass=gl;facRough=mix(0.9,0.45,clamp(trimM,0.0,1.0));
    base*=mix(0.72,1.0,smoothstep(0.0,2.5,z)); // grime / contact darkening near the ground
  }else if(u<-1.5){facRough=0.7;}
  else if(abs(wn.z)>=0.5){float t=fract(sin(dot(floor(vWinPos.xy*0.7),vec2(12.99,78.23)))*43758.5);base*=0.88+0.12*t;facRough=0.95;}
  diffuseColor.rgb=base;
}`;
