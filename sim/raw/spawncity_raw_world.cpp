// Raw C++ replacement for the 64 Three.js modules.
// No Three.js types, no scene graph, no virtuals. Each former module is one
// POD recipe. Visual recipes emit triangles. A none-recipe means that module
// drew nothing of its own: the native WebGL2 renderer or the native boot
// already owns that job, so the Three file is not rebuilt as a second GL.
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <vector>
enum ScKind { SC_NONE=0, SC_BOX=1, SC_HUMAN=2, SC_POLE=3, SC_DISC=4, SC_WATER=5, SC_GROUND=6, SC_JET=7, SC_GUN=8, SC_MARKER=9 };
struct ScModule {
 const char* file;
 const char* mesh;
 int kind;
 float rgba[4];
 float size[3];
};
struct ScEmit {
 std::vector<float> pos, nrm, col;
 std::vector<uint32_t> idx;
 void vert(float x,float y,float z,float nx,float ny,float nz,const float c[4]){
  pos.push_back(x);pos.push_back(y);pos.push_back(z);
  nrm.push_back(nx);nrm.push_back(ny);nrm.push_back(nz);
  col.push_back(c[0]);col.push_back(c[1]);col.push_back(c[2]);col.push_back(c[3]);
 }
 void tri(uint32_t a,uint32_t b,uint32_t c){idx.push_back(a);idx.push_back(b);idx.push_back(c);}
 void box(const float lo[3],const float hi[3],const float c[4]){
  const float p[8][3]={
   {lo[0],lo[1],lo[2]},{hi[0],lo[1],lo[2]},{hi[0],hi[1],lo[2]},{lo[0],hi[1],lo[2]},
   {lo[0],lo[1],hi[2]},{hi[0],lo[1],hi[2]},{hi[0],hi[1],hi[2]},{lo[0],hi[1],hi[2]}
  };
  const int faces[6][4]={{0,1,2,3},{4,7,6,5},{0,4,5,1},{1,5,6,2},{2,6,7,3},{3,7,4,0}};
  const float nn[6][3]={{0,0,-1},{0,0,1},{0,-1,0},{1,0,0},{0,1,0},{-1,0,0}};
  for(int f=0;f<6;f++){
   uint32_t base=(uint32_t)(pos.size()/3);
   for(int k=0;k<4;k++) vert(p[faces[f][k]][0],p[faces[f][k]][1],p[faces[f][k]][2],nn[f][0],nn[f][1],nn[f][2],c);
   tri(base,base+1,base+2); tri(base,base+2,base+3);
  }
 }
};
static const ScModule MODULES[]={
 {"box3d_collider_debug.mjs","collider-debug",SC_MARKER,{0.49f,1.00f,0.75f,1},{0.4f,0.4f,1.6f}},
 {"building_interiors.mjs","interior",SC_BOX,{0.72f,0.62f,0.48f,1},{3.2f,2.4f,2.6f}},
 {"character_model.mjs","character",SC_HUMAN,{0.29f,0.32f,0.22f,1},{0.45f,0.28f,1.75f}},
 {"cows.mjs","cow",SC_BOX,{0.95f,0.94f,0.91f,1},{1.6f,0.7f,1.1f}},
 {"crowd_characters.mjs","crowd",SC_HUMAN,{0.47f,0.47f,0.47f,1},{0.4f,0.26f,1.7f}},
 {"direct_fire_missiles.mjs","direct-missile",SC_POLE,{0.81f,0.84f,0.86f,1},{0.08f,0.08f,1.4f}},
 {"facade_marks.mjs","facade-mark",SC_DISC,{0.54f,0.52f,0.49f,1},{0.8f,0.05f,0.35f}},
 {"fighter_jets.mjs","fighter",SC_JET,{0.36f,0.39f,0.42f,1},{8.0f,6.0f,1.6f}},
 {"first_person_controller_v5.mjs","fp-body",SC_HUMAN,{0.29f,0.32f,0.22f,1},{0.45f,0.28f,1.75f}},
 {"first_person_weapon_runtime_v3.mjs","fp-weapon",SC_GUN,{0.85f,0.64f,0.25f,1},{0.7f,0.08f,0.12f}},
 {"flak_battery.mjs","flak",SC_BOX,{0.62f,0.22f,0.47f,1},{1.4f,1.4f,1.2f}},
 {"flight_fire_fx.mjs","flight-fire",SC_DISC,{1.00f,0.83f,0.42f,0.8f},{0.6f,0.6f,0.2f}},
 {"gameplay_final_runtime.mjs","final-runtime",SC_MARKER,{1.00f,0.82f,0.48f,1},{0.3f,0.3f,1.2f}},
 {"gameplay_final_runtime_v2.mjs","final-runtime-v2",SC_MARKER,{1.00f,0.60f,0.24f,1},{0.35f,0.35f,1.4f}},
 {"gameplay_polish.mjs","polish-blood",SC_DISC,{0.48f,0.03f,0.03f,1},{0.5f,0.5f,0.04f}},
 {"gameplay_polish_lite.mjs","polish-lite",SC_NONE,{0,0,0,0},{0,0,0}},
 {"gangsters.mjs","gangster",SC_HUMAN,{1.00f,0.82f,0.48f,1},{0.42f,0.28f,1.75f}},
 {"gps_live_mode.mjs","gps-pin",SC_MARKER,{0.26f,0.52f,0.96f,1},{0.35f,0.35f,2.2f}},
 {"gta_runtime_v1.mjs","gta-car",SC_BOX,{0.17f,0.44f,0.65f,1},{4.2f,1.8f,1.4f}},
 {"guided_missile.mjs","guided-missile",SC_POLE,{0.85f,0.86f,0.87f,1},{0.12f,0.12f,2.2f}},
 {"jet_mode.mjs","player-jet",SC_JET,{0.13f,0.15f,0.17f,1},{11.0f,9.0f,2.2f}},
 {"military_response.mjs","military",SC_HUMAN,{0.29f,0.34f,0.20f,1},{0.5f,0.32f,1.8f}},
 {"neon_bloom.mjs","neon-bloom",SC_NONE,{0,0,0,0},{0,0,0}},
 {"nuke_destruction.mjs","nuke",SC_DISC,{1.00f,0.54f,0.24f,0.85f},{6.0f,6.0f,0.4f}},
 {"peer_drone_model.mjs","peer-drone",SC_BOX,{0.21f,0.90f,1.00f,1},{0.46f,0.46f,0.18f}},
 {"pigeons.mjs","pigeon",SC_BOX,{0.55f,0.57f,0.63f,1},{0.28f,0.12f,0.16f}},
 {"ping_marker.mjs","ping",SC_MARKER,{0.91f,0.96f,1.00f,1},{0.25f,0.25f,1.8f}},
 {"player_car_mode.mjs","player-car",SC_BOX,{0.54f,0.56f,0.59f,1},{4.4f,1.9f,1.45f}},
 {"player_vehicle_runtime.mjs","vehicle-runtime",SC_BOX,{0.27f,0.64f,0.57f,1},{4.0f,1.8f,1.4f}},
 {"player_vehicle_runtime_v2.mjs","vehicle-runtime-v2",SC_BOX,{0.26f,0.72f,0.91f,1},{4.2f,1.85f,1.4f}},
 {"player_walk_mode.mjs","walk",SC_HUMAN,{0.20f,0.23f,0.26f,1},{0.45f,0.28f,1.75f}},
 {"player_walk_mode_v4.mjs","walk-v4",SC_HUMAN,{0.22f,0.25f,0.29f,1},{0.45f,0.28f,1.75f}},
 {"police_ground_units.mjs","police",SC_HUMAN,{0.09f,0.09f,0.10f,1},{0.48f,0.3f,1.8f}},
 {"race_track.mjs","race-track",SC_GROUND,{0.43f,0.96f,0.66f,1},{12.0f,3.0f,0.08f}},
 {"real_world_bootstrap.mjs","bootstrap",SC_NONE,{0,0,0,0},{0,0,0}},
 {"sandbox_game.mjs","sandbox",SC_BOX,{0.18f,0.42f,1.00f,1},{1.2f,1.2f,1.2f}},
 {"simulator.mjs","legacy-renderer",SC_NONE,{0,0,0,0},{0,0,0}},
 {"spawn_visibility_guard.mjs","spawn-guard",SC_NONE,{0,0,0,0},{0,0,0}},
 {"stylized_world_style.mjs","style",SC_NONE,{0,0,0,0},{0,0,0}},
 {"tow_service.mjs","tow",SC_BOX,{1.00f,0.64f,0.10f,1},{6.5f,2.3f,2.4f}},
 {"training_showcase.mjs","training-showcase",SC_BOX,{0.15f,0.19f,0.22f,1},{2.0f,2.0f,0.4f}},
 {"training_test_level_v2.mjs","training-level",SC_BOX,{0.55f,0.53f,0.50f,1},{4.0f,4.0f,0.3f}},
 {"vehicle_models.mjs","vehicle-model",SC_BOX,{0.10f,0.15f,0.19f,1},{4.3f,1.85f,1.35f}},
 {"viewmodel_arms.mjs","arms",SC_GUN,{0.18f,0.20f,0.22f,1},{0.35f,0.12f,0.55f}},
 {"vs_combat_presentation.mjs","vs-hit",SC_MARKER,{0.27f,0.65f,0.05f,1},{0.3f,0.3f,1.5f}},
 {"vs_multiplayer.mjs","vs-peer",SC_MARKER,{0.16f,0.84f,1.00f,1},{0.4f,0.4f,1.8f}},
 {"walk_world_experience_hotfix.mjs","walk-hotfix",SC_HUMAN,{0.16f,0.22f,0.28f,1},{0.45f,0.28f,1.75f}},
 {"wanted_police_drones.mjs","police-drone",SC_BOX,{0.95f,0.96f,0.96f,1},{0.7f,0.7f,0.22f}},
 {"weapon_models.mjs","weapon",SC_GUN,{0.17f,0.18f,0.21f,1},{0.85f,0.08f,0.16f}},
 {"world_action_feedback.mjs","action-flash",SC_DISC,{0.27f,0.64f,0.62f,1},{0.4f,0.4f,0.08f}},
 {"world_building_depth_occlusion.mjs","occlusion",SC_NONE,{0,0,0,0},{0,0,0}},
 {"world_car_explosion.mjs","car-explosion",SC_DISC,{1.00f,1.00f,1.00f,0.9f},{2.4f,2.4f,0.3f}},
 {"world_city_buildings.mjs","city-block",SC_BOX,{0.16f,0.90f,1.00f,1},{8.0f,8.0f,14.0f}},
 {"world_city_roads.mjs","road-slab",SC_GROUND,{0.24f,0.25f,0.27f,1},{10.0f,4.0f,0.06f}},
 {"world_critical_damage_fx.mjs","critical-fx",SC_DISC,{1.00f,1.00f,1.00f,1},{0.7f,0.7f,0.1f}},
 {"world_ground.mjs","ground-patch",SC_GROUND,{0.16f,0.20f,0.10f,1},{16.0f,16.0f,0.05f}},
 {"world_impacts.mjs","impact",SC_DISC,{0.81f,0.78f,0.71f,1},{0.55f,0.55f,0.06f}},
 {"world_liveliness.mjs","liveliness",SC_HUMAN,{0.78f,0.28f,0.23f,1},{0.4f,0.26f,1.7f}},
 {"world_map_full.mjs","map-pin",SC_MARKER,{0.22f,0.84f,1.00f,1},{0.3f,0.3f,2.0f}},
 {"world_person_ragdoll.mjs","ragdoll",SC_HUMAN,{1.00f,1.00f,1.00f,1},{0.45f,0.28f,1.75f}},
 {"world_population.mjs","population",SC_HUMAN,{0.84f,0.24f,0.20f,1},{0.4f,0.26f,1.7f}},
 {"world_procedural_population.mjs","procedural-people",SC_HUMAN,{0.78f,0.28f,0.23f,1},{0.4f,0.26f,1.7f}},
 {"world_water.mjs","water",SC_WATER,{0.09f,0.42f,0.60f,0.85f},{18.0f,18.0f,0.2f}},
 {"zombie_nights.mjs","zombie",SC_HUMAN,{0.54f,0.60f,0.47f,1},{0.42f,0.28f,1.72f}}
};
int sc_module_count(){return (int)(sizeof(MODULES)/sizeof(MODULES[0]));}
const ScModule* sc_module_at(int i){return (i>=0&&i<sc_module_count())?&MODULES[i]:0;}
static void shift(ScEmit& e,float x,float y,float z){
 for(size_t i=0;i<e.pos.size();i+=3){e.pos[i]+=x;e.pos[i+1]+=y;e.pos[i+2]+=z;}
}
static void add_human(ScEmit& e,const float s[3],const float c[4]){
 const float body[3]={-s[0]*0.28f,-s[1]*0.5f,s[2]*0.38f};
 const float bodyHi[3]={s[0]*0.28f,s[1]*0.5f,s[2]*0.78f};
 const float headLo[3]={-s[0]*0.16f,-s[1]*0.35f,s[2]*0.78f};
 const float headHi[3]={s[0]*0.16f,s[1]*0.35f,s[2]};
 const float legLo[3]={-s[0]*0.22f,-s[1]*0.35f,0};
 const float legHi[3]={s[0]*0.22f,s[1]*0.35f,s[2]*0.42f};
 e.box(body,bodyHi,c); e.box(headLo,headHi,c); e.box(legLo,legHi,c);
}
static void add_jet(ScEmit& e,const float s[3],const float c[4]){
 const float bodyLo[3]={-s[0]*0.5f,-s[1]*0.08f,s[2]*0.25f};
 const float bodyHi[3]={s[0]*0.5f,s[1]*0.08f,s[2]*0.75f};
 const float wingLo[3]={-s[0]*0.1f,-s[1]*0.5f,s[2]*0.4f};
 const float wingHi[3]={s[0]*0.25f,s[1]*0.5f,s[2]*0.55f};
 const float tailLo[3]={-s[0]*0.48f,-0.04f,s[2]*0.55f};
 const float tailHi[3]={-s[0]*0.28f,0.04f,s[2]};
 e.box(bodyLo,bodyHi,c); e.box(wingLo,wingHi,c); e.box(tailLo,tailHi,c);
}
static void add_gun(ScEmit& e,const float s[3],const float c[4]){
 const float bodyLo[3]={0,-s[1]*0.5f,-s[2]*0.5f};
 const float bodyHi[3]={s[0],s[1]*0.5f,s[2]*0.5f};
 const float gripLo[3]={s[0]*0.15f,-s[1]*0.35f,-s[2]*1.6f};
 const float gripHi[3]={s[0]*0.4f,s[1]*0.35f,0};
 e.box(bodyLo,bodyHi,c); e.box(gripLo,gripHi,c);
}
static void add_ground(ScEmit& e,const float s[3],const float c[4]){
 const float lo[3]={-s[0]*0.5f,-s[1]*0.5f,0};
 const float hi[3]={s[0]*0.5f,s[1]*0.5f,s[2]};
 e.box(lo,hi,c);
}
void sc_emit(int index, ScEmit& e){
 const ScModule* m=sc_module_at(index);
 if(!m||m->kind==SC_NONE) return;
 const float* s=m->size; const float* c=m->rgba;
 if(m->kind==SC_BOX||m->kind==SC_MARKER){
  const float lo[3]={-s[0]*0.5f,-s[1]*0.5f,0}, hi[3]={s[0]*0.5f,s[1]*0.5f,s[2]};
  e.box(lo,hi,c);
 }else if(m->kind==SC_HUMAN) add_human(e,s,c);
 else if(m->kind==SC_POLE){
  const float lo[3]={-s[0],-s[1],0}, hi[3]={s[0],s[1],s[2]};
  e.box(lo,hi,c);
 }else if(m->kind==SC_DISC||m->kind==SC_WATER) add_ground(e,s,c);
 else if(m->kind==SC_GROUND) add_ground(e,s,c);
 else if(m->kind==SC_JET) add_jet(e,s,c);
 else if(m->kind==SC_GUN) add_gun(e,s,c);
 const float x=(float)(index%8)*16.0f - 56.0f;
 const float y=70.0f+(float)(index/8)*16.0f;
 shift(e,x,y,0);
}
extern "C" int sc_module_count_c(){return sc_module_count();}
extern "C" int sc_emit_counts(int index,int* verts,int* indices,int* kind){
 const ScModule* m=sc_module_at(index);
 if(!m||!verts||!indices||!kind) return 0;
 *kind=m->kind;
 ScEmit e; sc_emit(index,e);
 *verts=(int)(e.pos.size()/3);
 *indices=(int)e.idx.size();
 return 1;
}
static const char* kind_name(int kind){
 switch(kind){
  case SC_BOX:return "box"; case SC_HUMAN:return "human"; case SC_POLE:return "pole";
  case SC_DISC:return "disc"; case SC_WATER:return "water"; case SC_GROUND:return "ground";
  case SC_JET:return "jet"; case SC_GUN:return "gun"; case SC_MARKER:return "marker";
  default:return "none";
 }
}
#ifdef SC_DUMP
static void dump_floats(FILE* out,const std::vector<float>& v){
 fputc('[',out);
 for(size_t i=0;i<v.size();i++) fprintf(out,"%s%.4f",i?",":"",v[i]);
 fputc(']',out);
}
static void dump_idx(FILE* out,const std::vector<uint32_t>& v){
 fputc('[',out);
 for(size_t i=0;i<v.size();i++) fprintf(out,"%s%u",i?",":"",v[i]);
 fputc(']',out);
}
int main(){
 const int n=sc_module_count();
 FILE* out=stdout;
 fprintf(out,"export const RAW_WORLD_VERSION=\"spawncity-raw-cpp-v1\";\nexport const RAW_MODULE_COUNT=%d;\nexport const RAW_MODULES=[\n",n);
 for(int i=0;i<n;i++){
  ScEmit e; sc_emit(i,e);
  const ScModule* m=&MODULES[i];
  fprintf(out,"{file:\"%s\",mesh:\"%s\",kind:\"%s\",color:[%.4f,%.4f,%.4f,%.4f],vertices:%d,positions:",
   m->file,m->mesh,kind_name(m->kind),m->rgba[0],m->rgba[1],m->rgba[2],m->rgba[3],(int)(e.pos.size()/3));
  dump_floats(out,e.pos); fprintf(out,",normals:"); dump_floats(out,e.nrm);
  fprintf(out,",colors:"); dump_floats(out,e.col); fprintf(out,",indices:"); dump_idx(out,e.idx);
  fprintf(out,"}%s\n",i+1<n?",":"");
 }
 fprintf(out,"];\n");
 return 0;
}
#endif
