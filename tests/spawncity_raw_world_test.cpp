#include <stdio.h>
extern "C" int sc_module_count_c();
extern "C" int sc_emit_counts(int index,int* verts,int* indices,int* kind);
int main(){
 const int n=sc_module_count_c();
 if(n!=64){fprintf(stderr,"expected 64 modules, got %d\n",n);return 1;}
 int visual=0,empty=0;
 for(int i=0;i<n;i++){
  int verts=0,indices=0,kind=-1;
  if(!sc_emit_counts(i,&verts,&indices,&kind)){fprintf(stderr,"missing %d\n",i);return 1;}
  if(kind==0){if(verts||indices){fprintf(stderr,"none module %d emitted geometry\n",i);return 1;} empty++;}
  else{if(verts<8||indices<12){fprintf(stderr,"visual module %d too small\n",i);return 1;} visual++;}
 }
 if(visual+empty!=64||visual<50){fprintf(stderr,"visual %d empty %d\n",visual,empty);return 1;}
 printf("raw c++ world: %d modules, %d meshes, %d retired\n",n,visual,empty);
 return 0;
}
