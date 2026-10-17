// Canonical world coordinates for the sole native WebGL2 renderer.
// This is the identical WGS84-radius local tangent projection currently used
// for authoritative Box3D building collision geometry in real_world_bootstrap.
// ONE origin, in [longitude, latitude] degrees, measured in metres east/north.
export const NATIVE_OSM_PROJECTOR_VERSION="real-world-box3d-metric-projection-v1";
const EARTH_RADIUS_M=6378137;
const RAD=Math.PI/180;
const isFiniteLatLon=(lon,lat)=>Number.isFinite(lon)&&Number.isFinite(lat)
 &&Math.abs(lon)<=180&&Math.abs(lat)<=90;
export function nativeOsmProjector(origin){
 const lon=Number(origin?.lon??origin?.longitude);
 const lat=Number(origin?.lat??origin?.latitude);
 if(!isFiniteLatLon(lon,lat)||Math.abs(lat)>85)
  throw Error("native OSM source needs finite, nonpolar WGS84 origin");
 const cos=Math.max(.01,Math.cos(lat*RAD));
 const key=lon.toFixed(7)+":"+lat.toFixed(7);
 const project=(longitude,latitude)=>{
  if(!isFiniteLatLon(Number(longitude),Number(latitude)))
   throw Error("invalid native OSM feature coordinates");
  return [(Number(longitude)-lon)*RAD*EARTH_RADIUS_M*cos,
   (Number(latitude)-lat)*RAD*EARTH_RADIUS_M];
 };
 return Object.freeze({key,lon,lat,project});
}
