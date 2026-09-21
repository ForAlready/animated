import * as T from 'three';

// Runtime collision projection. The original mesh and downloadable GLB stay intact.
export class ClothCollision {
 constructor(root){
  this.root=root;this.enabled=true;this.padding=.006;this.items=[];this.bones={};this.stats={vertices:0,contacts:0,maxCorrection:0};
  root.traverse(o=>{
   if(o.isBone && o.name.startsWith('SK_Role1_Body__'))this.bones[o.name.split('__').at(-1)]=o;
   if(o.isSkinnedMesh && o.skeleton.bones.some(b=>b.name.startsWith('SK_Role1_Suit13_Skirt__'))){
    o.geometry=o.geometry.clone();const p=o.geometry.attributes.position;
    const rest=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){rest[i*3]=p.getX(i);rest[i*3+1]=p.getY(i);rest[i*3+2]=p.getZ(i)}this.items.push({mesh:o,rest,offset:new Float32Array(p.count*3),worldBones:o.skeleton.bones.map(()=>new T.Matrix4())});this.stats.vertices+=p.count;
   }
  });
  this.capsules=['L','R'].map(side=>({a:this.bones['Hip_'+side],b:this.bones['Knee_'+side],start:new T.Vector3(),end:new T.Vector3(),r0:.060,r1:.044})).filter(c=>c.a&&c.b);
  this.v=new T.Vector3();this.q=new T.Vector3();this.axis=new T.Vector3();this.delta=new T.Vector3();this.original=new T.Vector3();this.target=new T.Vector3();this.saved=new T.Vector3();
  this.blend=new T.Matrix4();this.boneMatrix=new T.Matrix4();this.skin=new T.Matrix4();this.inverse=new T.Matrix4();this.tick=0;
  if(!this.items.length||this.capsules.length!==2)throw new Error('Missing skirt collision rig');
 }
 reset(){for(const item of this.items){item.offset.fill(0);const p=item.mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,item.rest[i*3],item.rest[i*3+1],item.rest[i*3+2]);item.mesh.geometry.attributes.position.needsUpdate=true;item.mesh.geometry.computeVertexNormals();}}
 project(p){let candidate=false;for(const c of this.capsules){const r=Math.max(c.r0,c.r1)+this.padding;if(p.x>=Math.min(c.start.x,c.end.x)-r&&p.x<=Math.max(c.start.x,c.end.x)+r&&p.y>=Math.min(c.start.y,c.end.y)-r&&p.y<=Math.max(c.start.y,c.end.y)+r&&p.z>=Math.min(c.start.z,c.end.z)-r&&p.z<=Math.max(c.start.z,c.end.z)+r){candidate=true;break}}if(!candidate)return false;let hit=false;for(let pass=0;pass<3;pass++)for(const c of this.capsules){
  this.axis.subVectors(c.end,c.start);const t=T.MathUtils.clamp(this.q.subVectors(p,c.start).dot(this.axis)/this.axis.lengthSq(),0,1);
  this.q.copy(c.start).addScaledVector(this.axis,t);this.delta.subVectors(p,this.q);const distance=this.delta.length(),radius=T.MathUtils.lerp(c.r0,c.r1,t)+this.padding;
  if(distance<radius){if(distance<1e-7)this.delta.set(0,0,1);else this.delta.multiplyScalar(1/distance);const projected=radius+0.002*Math.exp((distance-radius)/0.004);p.copy(this.q).addScaledVector(this.delta,projected);hit=true;}
 }return hit;}
 update(dt=1/60){
  if(!this.enabled)return;
  this.root.updateMatrixWorld(true);for(const c of this.capsules){c.a.getWorldPosition(c.start);c.b.getWorldPosition(c.end);}
  this.stats.contacts=0;this.stats.maxCorrection=0;const decay=Math.exp(-Math.min(dt,.05)*18);
  for(const item of this.items){const m=item.mesh,g=m.geometry,p=g.attributes.position,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;m.skeleton.update();let dirty=false;
   // Precompose bone-to-world skin matrices once per bone, not per vertex.
   this.skin.copy(m.matrixWorld).multiply(m.bindMatrixInverse);
   for(let j=0;j<item.worldBones.length;j++){this.boneMatrix.fromArray(m.skeleton.boneMatrices,j*16);item.worldBones[j].copy(this.skin).multiply(this.boneMatrix).multiply(m.bindMatrix);}
   for(let i=0;i<p.count;i++){
    const px=item.rest[i*3],py=item.rest[i*3+1],pz=item.rest[i*3+2];let wx=0,wy=0,wz=0;
    for(let j=0;j<4;j++){const w=weights.getComponent(i,j);if(!w)continue;const e=item.worldBones[indices.getComponent(i,j)].elements;wx+=(e[0]*px+e[4]*py+e[8]*pz+e[12])*w;wy+=(e[1]*px+e[5]*py+e[9]*pz+e[13])*w;wz+=(e[2]*px+e[6]*py+e[10]*pz+e[14])*w;}
    this.original.set(wx,wy,wz);this.target.copy(this.original);
    // Smooth only the release; penetration is projected out immediately.
    const wasMoved=item.offset[i*3]!==0||item.offset[i*3+1]!==0||item.offset[i*3+2]!==0;this.saved.fromArray(item.offset,i*3).multiplyScalar(decay);if(this.saved.lengthSq()<1e-12)this.saved.set(0,0,0);this.target.add(this.saved);
    if(this.project(this.target))this.stats.contacts++;
    this.saved.subVectors(this.target,this.original);this.saved.toArray(item.offset,i*3);this.stats.maxCorrection=Math.max(this.stats.maxCorrection,this.saved.length());
    if(!wasMoved&&this.saved.lengthSq()<1e-12)continue;dirty=true;
    this.blend.elements.fill(0);for(let j=0;j<4;j++){const w=weights.getComponent(i,j);if(!w)continue;const e=item.worldBones[indices.getComponent(i,j)].elements;for(let k=0;k<16;k++)this.blend.elements[k]+=e[k]*w;}
    this.inverse.copy(this.blend).invert();this.v.copy(this.target).applyMatrix4(this.inverse);p.setXYZ(i,this.v.x,this.v.y,this.v.z);
   }
   if(dirty){p.needsUpdate=true;if(this.tick%3===0)g.computeVertexNormals();}m.frustumCulled=false;
  }this.tick++;
 }
}

