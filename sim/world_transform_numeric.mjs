// Numeric transforms for the existing airframe scene and the sole native
// renderer. Geometry/Box3D own the pose; consumers do not need Three objects.
export const WORLD_TRANSFORM_NUMERIC_VERSION="native-world-transform-v1";
const elements=node=>node?.matrixWorld?.elements??node?.matrixWorld;
export function worldRootPose(root){
 root?.updateWorldMatrix?.(true,false);
 const e=elements(root);
 if(e?.length!==16||![e[0],e[4],e[8],e[12],e[13],e[14]].every(Number.isFinite))return null;
 // Euler XYZ: same yaw extraction as a decomposed world quaternion, allowing
 // parents and non-unit scales. At a pitch gimbal lock, Three sets Z to zero.
 const sx=Math.hypot(e[0],e[1],e[2]),sy=Math.hypot(e[4],e[5],e[6]),sz=Math.hypot(e[8],e[9],e[10]);
 if(!(sx>1e-10&&sy>1e-10&&sz>1e-10))return null;
 const m11=e[0]/sx,m12=e[4]/sy,m13=e[8]/sz;
 const yaw=Math.abs(m13)<.9999999?Math.atan2(-m12,m11):0;
 return {x:e[12],y:e[13],yaw,pitch:0};
}
export function worldVisualBottom(root){
 root?.updateMatrixWorld?.(true);
 let bottom=Infinity;
 const examine=node=>{
  const g=node?.geometry,e=elements(node);
  if(!g||e?.length!==16)return;
  if(!g.boundingBox)g.computeBoundingBox?.();
  const bounds=g.boundingBox;
  if(!bounds)return;
  const min=bounds.min,max=bounds.max;
  const points=[min?.x,max?.x,min?.y,max?.y,min?.z,max?.z];
  if(!points.every(Number.isFinite)||![e[2],e[6],e[10],e[14]].every(Number.isFinite))return;
  const z=e[14]
   +Math.min(e[2]*min.x,e[2]*max.x)
   +Math.min(e[6]*min.y,e[6]*max.y)
   +Math.min(e[10]*min.z,e[10]*max.z);
  if(z<bottom)bottom=z;
 };
 if(typeof root?.traverse==="function")root.traverse(examine);else if(root)examine(root);
 return Number.isFinite(bottom)?bottom:null;
}
