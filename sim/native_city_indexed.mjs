// Lossless GPU triangle buffer compaction for native WebGL2 city chunks.
// Identical position/normal/colour/UV tuples share a vertex; hard-edged walls,
// roofs, damaged heights and courtyard seams remain exactly unchanged.
// Index lookup uses the IEEE754 bit patterns, never lossy decimal rounding.
export const NATIVE_INDEX_VERSION="city-indexed-triangles-v1";
const isF32=(x)=>x instanceof Float32Array;
export function packCityMesh(mesh,{minSaving=0}={}){
  const {positions,colors,normals,uvs}=mesh||{};
  if(![positions,colors,normals,uvs].every(isF32))throw Error("native indexed geometry needs four Float32Array attributes");
  const count=positions.length/3;
  if(!count||positions.length%9||colors.length!==positions.length||normals.length!==positions.length||uvs.length!==count*2)throw Error("invalid city triangles");
  if(mesh.indices)throw Error("do not re-index existing indexed geometry");
  const facade=mesh.facade instanceof Float32Array&&mesh.facade.length===count*4?mesh.facade:null;
  const rawBytes=positions.byteLength+colors.byteLength+normals.byteLength+uvs.byteLength+(facade?.byteLength||0);
  const fields=facade?[positions,normals,colors,uvs,facade]:[positions,normals,colors,uvs];
  const bitFields=fields.map(x=>new Uint32Array(x.buffer,x.byteOffset,x.length));
  const stride=[3,3,3,2,4];
  const unique=fields.map(()=>[]),mapping=new Map(),indices=new Uint32Array(count);
  for(let i=0;i<count;i++){
    const key=bitFields.map((bits,j)=>Array.from(bits.subarray(i*stride[j],(i+1)*stride[j])).join(",")).join("|");
    let index=mapping.get(key);
    if(index===undefined){
      index=mapping.size;mapping.set(key,index);
      fields.forEach((values,j)=>{for(let k=0;k<stride[j];k++)unique[j].push(values[i*stride[j]+k]);});
    }
    indices[i]=index;
  }
  const indexBuffer=mapping.size<=65535?new Uint16Array(indices):indices;
  const [p,n,c,uv,fac]=unique.map(a=>new Float32Array(a));
  const indexedBytes=p.byteLength+n.byteLength+c.byteLength+uv.byteLength+(fac?.byteLength||0)+indexBuffer.byteLength;
  const saving=rawBytes-indexedBytes;
  const output=saving>minSaving?{...mesh,positions:p,normals:n,colors:c,uvs:uv,...(fac?{facade:fac}:{}),indices:indexBuffer}:mesh;
  return {mesh:output,indexed:output!==mesh,uniqueVertices:mapping.size,sourceVertices:count,bytesBefore:rawBytes,bytesAfter:output===mesh?rawBytes:indexedBytes};
}
