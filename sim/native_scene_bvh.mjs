// Native ray scene acceleration: per-mesh BVH for large static indexed city
// and terrain buffers. The *rendered* triangle stream is the source of truth.
// No THREE.Raycaster and no duplicate collision-physics world.
export const NATIVE_BVH_VERSION="native-ray-bvh-v1";
const axisValue=(p,a)=>p[p.length===3?a:a];
const read=(p,i,a)=>p[i*3+a];
function bounds(p,triangles,begin,end){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=begin;i<end;i++)for(const j of triangles[i].ids)for(let a=0;a<3;a++){
    const n=read(p,j,a);min[a]=Math.min(min[a],n);max[a]=Math.max(max[a],n);
  }
  return {min,max};
}
export function nativeBuildBvh(positions,indices=null,{leafTriangles=12}={}){
  if(!(positions instanceof Float32Array)||positions.length%3||positions.length<9)throw Error("BVH expects triangle positions");
  if(indices!==null&&!(indices instanceof Uint16Array||indices instanceof Uint32Array))throw Error("BVH expects Uint indices");
  const triCount=(indices?.length||positions.length/3)/3;
  if(!Number.isInteger(triCount)||!triCount||!Number.isInteger(leafTriangles)||leafTriangles<1)throw Error("invalid triangle count");
  const triangles=[];
  for(let f=0;f<triCount;f++){
    const ids=[0,1,2].map(j=>indices?indices[f*3+j]:f*3+j);
    if(ids.some(j=>j*3+2>=positions.length))throw Error("index outside BVH mesh");
    const center=[0,1,2].map(a=>ids.reduce((sum,j)=>sum+read(positions,j,a),0)/3);
    triangles.push({ids,center,face:f});
  }
  const nodes=[];
  function split(begin,end){
    const bb=bounds(positions,triangles,begin,end),index=nodes.length,count=end-begin;
    const node={...bb,begin,count,left:-1,right:-1};nodes.push(node);
    if(count<=leafTriangles)return index;
    const extents=bb.max.map((v,i)=>v-bb.min[i]),axis=extents.indexOf(Math.max(...extents));
    const slice=triangles.slice(begin,end).sort((a,b)=>a.center[axis]-b.center[axis]||a.face-b.face);
    triangles.splice(begin,count,...slice);
    const mid=begin+Math.floor(count/2);
    if(mid===begin||mid===end)return index;
    node.left=split(begin,mid);node.right=split(mid,end);node.count=0;return index;
  }
  split(0,triangles.length);
  return {positions,triangles,nodes,faces:triCount};
}
export function nativeRayAabb(origin,direction,min,max,maxT=Infinity){
  let low=0,high=maxT;
  for(let k=0;k<3;k++){
    if(Math.abs(direction[k])<1e-12){if(origin[k]<min[k]||origin[k]>max[k])return false;continue;}
    let a=(min[k]-origin[k])/direction[k],b=(max[k]-origin[k])/direction[k];
    if(a>b){const temp=a;a=b;b=temp;}
    low=Math.max(low,a);high=Math.min(high,b);
    if(high<low)return false;
  }
  return high>=0;
}
export function nativeBvhTriangles(bvh,origin,direction,maxT=Infinity){
  const result=[],stack=[0];
  while(stack.length){
    const n=bvh.nodes[stack.pop()];
    if(!nativeRayAabb(origin,direction,n.min,n.max,maxT))continue;
    if(n.left>=0){stack.push(n.left,n.right);continue;}
    for(let i=n.begin;i<n.begin+n.count;i++)result.push(bvh.triangles[i]);
  }
  return result;
}
