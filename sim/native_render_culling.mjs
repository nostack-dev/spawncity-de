// Conservative native-only WebGL2 scene culling. No Three imports.
// Column-major OpenGL view-projection, Z-up and metre-sized world bounds.
export const NATIVE_CULLING_VERSION="webgl2-conservative-frustum-v1";
export function extractFrustumPlanes(m){
  if(!m||m.length!==16)throw Error("frustum expects a 4x4 matrix");
  const planes=[];
  for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){
    const a=m[3]+sign*m[axis],b=m[7]+sign*m[4+axis],c=m[11]+sign*m[8+axis],d=m[15]+sign*m[12+axis];
    const len=Math.hypot(a,b,c);
    if(!(len>1e-12))throw Error("degenerate frustum");
    planes.push([a/len,b/len,c/len,d/len]);
  }
  return planes;
}
export function sphereVisible(planes,center,radius){
  if(!Array.isArray(planes)||planes.length!==6||center?.length!==3||!(radius>=0))throw Error("invalid frustum sphere");
  return planes.every(p=>p[0]*center[0]+p[1]*center[1]+p[2]*center[2]+p[3]>=-radius);
}
export function geometryBoundingSphere(positions){
  if(!(positions instanceof Float32Array)||positions.length<9||positions.length%3)throw Error("invalid positions");
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3)for(let j=0;j<3;j++){
    const v=positions[i+j];if(!Number.isFinite(v))throw Error("non-finite geometry");
    min[j]=Math.min(min[j],v);max[j]=Math.max(max[j],v);
  }
  const center=min.map((v,i)=>(v+max[i])*0.5);
  let radius2=0;
  for(let i=0;i<positions.length;i+=3){
    const dx=positions[i]-center[0],dy=positions[i+1]-center[1],dz=positions[i+2]-center[2];
    radius2=Math.max(radius2,dx*dx+dy*dy+dz*dz);
  }
  return {center,radius:Math.sqrt(radius2)};
}
export function instancedBoundingSphere(local,transforms){
  if(!local||!transforms||transforms.length%16||!transforms.length)throw Error("invalid world bounds");
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<transforms.length;i+=16){
    const x=local.center[0],y=local.center[1],z=local.center[2];
    const center=[transforms[i]*x+transforms[i+4]*y+transforms[i+8]*z+transforms[i+12],
      transforms[i+1]*x+transforms[i+5]*y+transforms[i+9]*z+transforms[i+13],
      transforms[i+2]*x+transforms[i+6]*y+transforms[i+10]*z+transforms[i+14]];
    // Frobenius norm conservatively upper-bounds any 3x3 matrix scaling.
    const r=local.radius*Math.hypot(transforms[i],transforms[i+1],transforms[i+2],
      transforms[i+4],transforms[i+5],transforms[i+6],transforms[i+8],transforms[i+9],transforms[i+10]);
    for(let j=0;j<3;j++){min[j]=Math.min(min[j],center[j]-r);max[j]=Math.max(max[j],center[j]+r);}
  }
  const center=min.map((v,i)=>(v+max[i])/2);
  return {center,radius:Math.hypot(...max.map((v,i)=>v-center[i]))};
}
