// Native-only scene hierarchy for gameplay attachments: players, vehicles,
// weapons, rotor mounts, HUD-world markers. One graphics backend and one
// Box3D authority; there is NO Three.js scene graph or compatibility fallback.
import {fromTRS,multiply4,identity4} from "./native_render_math.mjs";
export const NATIVE_SCENE_GRAPH_VERSION="native-hierarchy-incremental-v3";
const vec=(v,n,name)=>{if(!Array.isArray(v)&&!(v instanceof Float32Array))throw Error(name+" expects "+n+" components");if(v.length!==n||Array.from(v).some(x=>!Number.isFinite(x)))throw Error("invalid "+name);return Array.from(v);};
export class NativeSceneGraph{
 constructor(renderer){
  if(typeof renderer?.updateInstances!=="function"||typeof renderer?.setVisible!=="function"||typeof renderer?.remove!=="function")
   throw Error("native scene graph requires a single native WebGL2 renderer");
  this.renderer=renderer;this.nodes=new Map();this.meshOwners=new Map();this.pendingRoots=new Set();this.closed=false;this.version=0;
 }
 require(id){const node=this.nodes.get(id);if(!node)throw Error("unknown native node "+id);return node;}
 add(id,{parent=null,meshId=null,position=[0,0,0],rotation=[0,0,0,1],scale=[1,1,1],visible=true}={}){
  if(this.closed)throw Error("native scene graph disposed");
  if(typeof id!=="string"||!id.trim()||this.nodes.has(id))throw Error("native node ID must be unique");
  if(parent!==null)this.require(parent);
  if(meshId!==null){
   if(typeof meshId!=="string"||!meshId.trim())throw Error("invalid native GPU mesh ID");
   if(this.meshOwners.has(meshId))
    throw Error("native GPU mesh already owned by another scene node");
  }
  const node={id,parent,children:new Set(),meshId,position:vec(position,3,"position"),
   rotation:vec(rotation,4,"rotation"),scale:vec(scale,3,"scale"),visible:Boolean(visible),
   effectiveVisible:false,world:identity4(),dirty:true,updated:false};
  if(Math.hypot(...node.rotation)<1e-10||node.scale.some(x=>x===0))throw Error("degenerate native transform");
  this.nodes.set(id,node);if(meshId!==null)this.meshOwners.set(meshId,id);
  if(parent!==null)this.nodes.get(parent).children.add(id);
  this.pendingRoots.add(id);this.version++;return id;
 }
 dirtySubtree(id){
  // Dirty ancestors invalidate descendants at sync time. Do not walk all
  // attachments on every changed parent pose or every stationary frame.
  this.require(id).dirty=true;
  this.pendingRoots.add(id);
  this.version++;
 }
 setTransform(id,{position,rotation,scale}={}){
  if(this.closed)throw Error("native scene graph disposed");
  const node=this.require(id);
  // Validate the entire Box3D pose before changing anything; a rejected
  // quaternion/scale must never half-update a live actor.
  const nextPosition=position===undefined?node.position:vec(position,3,"position");
  const nextRotation=rotation===undefined?node.rotation:vec(rotation,4,"rotation");
  const nextScale=scale===undefined?node.scale:vec(scale,3,"scale");
  if(Math.hypot(...nextRotation)<1e-10)throw Error("degenerate rotation");
  if(nextScale.some(x=>x===0))throw Error("degenerate scale");
  if(nextPosition.every((x,i)=>x===node.position[i])
   &&nextRotation.every((x,i)=>x===node.rotation[i])
   &&nextScale.every((x,i)=>x===node.scale[i]))return false;
  node.position=nextPosition;node.rotation=nextRotation;node.scale=nextScale;
  this.dirtySubtree(id);return true;
 }
 setVisible(id,visible){
  if(this.closed)throw Error("native scene graph disposed");
  const node=this.require(id);
  if(node.visible===Boolean(visible))return false;
  node.visible=Boolean(visible);this.dirtySubtree(id);return true;
 }
 setParent(id,parent=null){
  if(this.closed)throw Error("native scene graph disposed");
  const node=this.require(id);
  if(parent!==null)this.require(parent);
  if(id===parent)throw Error("native scene graph cycle");
  for(let cursor=parent;cursor!==null;cursor=this.require(cursor).parent)
   if(cursor===id)throw Error("native scene graph cycle");
  if(node.parent===parent)return false;
  if(node.parent!==null)this.require(node.parent).children.delete(id);
  node.parent=parent;
  if(parent!==null)this.require(parent).children.add(id);
  this.dirtySubtree(id);return true;
 }
 remove(id){
  if(this.closed)throw Error("native scene graph disposed");
  const root=this.require(id),deleted=[];
  const collect=n=>{for(const child of n.children)collect(this.require(child));deleted.push(n.id);};
  collect(root);
  if(root.parent!==null)this.require(root.parent).children.delete(id);
  for(const key of deleted){
   const n=this.nodes.get(key);
   if(n.meshId){
    this.renderer.remove(n.meshId); // Owning a GPU mesh includes releasing its VAO/VBO on despawn.
    this.meshOwners.delete(n.meshId);
   }
   this.pendingRoots.delete(key);
   this.nodes.delete(key);
  }
  this.version++;return deleted.length;
 }
 sync(){
  if(this.closed)throw Error("native scene graph disposed");
  let matrices=0,visibilityChanges=0,visited=0;
  if(!this.pendingRoots.size)return {nodes:this.nodes.size,worldMatrices:0,visibilityChanges:0,visited:0,version:this.version};
  const roots=[...this.pendingRoots],covered=new Set(roots);
  this.pendingRoots.clear();
  const visit=(node,parentWorld,parentVisible,parentDirty)=>{
   visited++;
   const dirty=node.dirty||parentDirty;
   if(dirty){
    node.world=multiply4(parentWorld,fromTRS(node.position,node.rotation,node.scale));
    matrices++;
   }
   const visible=parentVisible&&node.visible;
   if(node.meshId){
    if(visible!==node.effectiveVisible||!node.updated){
     this.renderer.setVisible(node.meshId,visible);visibilityChanges++;
    }
    if(visible&&dirty){
     this.renderer.updateInstances(node.meshId,{transforms:new Float32Array(node.world)});
     node.updated=true;
    }
   }
   node.effectiveVisible=visible;node.dirty=false;
   for(const id of node.children)visit(this.require(id),node.world,visible,dirty);
  };
  try{
   for(const id of roots){
    const node=this.nodes.get(id);if(!node)continue;
    let ancestorDirty=false;
    for(let parent=node.parent;parent!==null;parent=this.require(parent).parent){
     if(covered.has(parent)){ancestorDirty=true;break;}
    }
    if(ancestorDirty)continue;
    const parent=node.parent===null?null:this.require(node.parent);
    visit(node,parent?.world??identity4(),parent?.effectiveVisible??true,false);
   }
  }catch(error){
   // Failed GPU writes must be retried after WebGL context recovery.
   for(const id of roots){const node=this.nodes.get(id);if(node){node.dirty=true;this.pendingRoots.add(id);}}
   throw error;
  }
  return {nodes:this.nodes.size,worldMatrices:matrices,visibilityChanges,visited,version:this.version};
 }
 worldMatrix(id){return new Float32Array(this.require(id).world);}
 dispose(){
  if(this.closed)return;
  for(const node of this.nodes.values())if(node.meshId)this.renderer.remove(node.meshId);
  this.nodes.clear();this.meshOwners.clear();this.pendingRoots.clear();this.closed=true;
 }
}
