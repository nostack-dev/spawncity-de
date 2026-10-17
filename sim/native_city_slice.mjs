import {NativeCityFacades,NATIVE_FACADE_GL_VERSION} from "./native_city_facades.mjs";

// Native WebGL2 live-city *vertical slice* with real procedural facade windows.
// Still shares Three's scene graph, collision, raycasts and material system and
// does NOT reproduce full PBR/environment map/shadows. Opt-in for safe A/B only.
export const NATIVE_CITY_SLICE_VERSION="native-webgl2-city-facades-experimental-v2";
const ATTRIBUTES=["position","color","aWall","aSeed","aFloorH","normal"];

export class NativeCitySlice {
  constructor(renderer){
    const gl=renderer?.getContext?.();
    if(!gl||typeof gl.createVertexArray!=="function")throw Error("Native city facades need WebGL2");
    this.renderer=renderer;this.gl=gl;
    this.native=new NativeCityFacades(gl,{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight});
    this.owners=[];this.entries=[];this.shownFrames=0;this.geometryKeys=[];this.sources=[];
  }
  attribs(attributes){
    return Object.fromEntries(ATTRIBUTES.map(key=>[key,attributes[key].array]));
  }
  chunks(scene){
    const root=scene?.getObjectByName?.("WORLD_CITY_BUILDINGS");
    if(!root||!root.visible)return [];
    const result=[];
    root.traverse?.(n=>{
      const a=n.geometry?.attributes,p=a?.position,c=a?.color;
      if(n.isMesh&&n.name==="WORLD_CITY_CHUNK"&&n.visible&&p?.array instanceof Float32Array
        &&c?.array instanceof Float32Array&&p.array.length===c.array.length&&p.array.length%9===0
        &&ATTRIBUTES.every(k=>a[k]?.array instanceof Float32Array))result.push(n);
    });
    return result;
  }
  prepare(scene){
    const objects=this.chunks(scene);
    if(!objects.length)return null;
    const ids=objects.map(n=>n.geometry.uuid);
    const changed=ids.length!==this.geometryKeys.length||ids.some((id,i)=>this.geometryKeys[i]!==id);
    if(changed){
      this.native.clear();this.entries=[];this.geometryKeys=ids;
      for(const mesh of objects)this.entries.push(this.native.add(this.attribs(mesh.geometry.attributes)));
      this.sources=objects.map(n=>ATTRIBUTES.map(k=>n.geometry.attributes[k].version));
    }else for(let i=0;i<objects.length;i++){
      const a=objects[i].geometry.attributes,prev=this.sources[i],versions=ATTRIBUTES.map(k=>a[k].version);
      if(versions.every((n,k)=>n===prev[k]))continue;
      this.native.update(this.entries[i],this.attribs(a));this.sources[i]=versions;
    }
    this.owners=objects.map(mesh=>({mesh,visible:mesh.visible}));
    for(const o of this.owners)o.mesh.visible=false;
    return objects.length;
  }
  restore(){for(const o of this.owners)o.mesh.visible=o.visible;this.owners=[];}
  draw(camera){
    if(!this.entries.length)return null;
    const gl=this.gl,renderer=this.renderer;
    renderer.resetState();
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
    gl.colorMask(true,true,true,true);gl.depthMask(true);
    const a=camera.projectionMatrix.elements,b=camera.matrixWorldInverse.elements,m=new Float32Array(16);
    for(let col=0;col<4;col++)for(let row=0;row<4;row++)
      m[col*4+row]=a[row]*b[col*4]+a[row+4]*b[col*4+1]+a[row+8]*b[col*4+2]+a[row+12]*b[col*4+3];
    this.native.resize(gl.drawingBufferWidth,gl.drawingBufferHeight);
    const fog=renderer.getClearColor?.(),world=globalThis.__arondightRealWorld;
    const sun=world?.threeScene?.getObjectByName?.("REAL_SUN"),sunDir=sun?.position?[sun.position.x,sun.position.y,sun.position.z]:[-.45,-.52,.72];
    let result;
    try{
      result=this.native.render(m,{clear:false,eye:[camera.position.x,camera.position.y,camera.position.z],sunDir,
        fogColor:fog?[fog.r,fog.g,fog.b]:[.75,.83,.89],exposure:renderer.toneMappingExposure||1});
      this.shownFrames++;
    }finally{renderer.resetState();}
    return result;
  }
  dispose(){this.restore();this.native.dispose();this.geometryKeys=[];this.entries=[];}
}
