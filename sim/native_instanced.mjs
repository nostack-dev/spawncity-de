// Per-frame instanced meshes without re-uploading geometry: the first frame
// upserts the mesh, later frames only stream the instance buffers
// (renderer.updateInstances grows its capacity geometrically), an empty list
// removes it. Used by the ambient / effects modules that animate every frame.
const live=new WeakMap();
function state(r){let s=live.get(r);if(!s){s=new Map();live.set(r,s);}return s;}
export function syncInstanced(r,id,geo,transforms,{tints=null,material={}}={}){
  if(!r?.upsert)return;const s=state(r);
  if(!transforms?.length){if(s.has(id)||r.meshes?.has?.(id)){try{r.remove(id);}catch{}s.delete(id);}return;}
  const inst={transforms};if(tints)inst.tints=tints;
  if(s.get(id)===geo&&r.meshes?.has?.(id)){try{r.updateInstances(id,inst);return;}catch{}}
  r.upsert(id,{...geo,instances:inst,material});s.set(id,geo);
}
export function packMatrices(list){const o=new Float32Array(list.length*16);for(let i=0;i<list.length;i++)o.set(list[i],i*16);return o;}
