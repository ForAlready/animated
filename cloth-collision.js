import * as T from 'three';

// Runtime collision projection. The original mesh and downloadable GLB stay intact.
export class ClothCollision {
 constructor(root){
  this.root=root;this.enabled=true;this.padding=.006;this.items=[];this.bones={};this.stats={vertices:0,contacts:0,maxCorrection:0};
  root.traverse(o=>{
   if(o.isBone && o.name.startsWith('SK_Role1_Body__'))this.bones[o.name.split('__').at(-1)]=o;
   if(o.isSkinnedMesh && o.skeleton.bones.some(b=>b.name.startsWith('SK_Role1_Suit13_Skirt__'))){
    o.geometry=o.geometry.clone();const p=o.geometry.attributes.position;
    const rest=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){rest[i*3]=p.getX(i);rest[i*3+1]=p.getY(i);rest[i*3+2]=p.getZ(i)}this.items.push({mesh:o,rest,offset:new Float32Array(p.count*3)});this.stats.vertices+=p.count;
   }
  });
  this.capsules=['L','R'].map(side=>({a:this.bones['Hip_'+side],b:this.bones['Knee_'+side],start:new T.Vector3(),end:new T.Vector3(),r0:.060,r1:.044})).filter(c=>c.a&&c.b);
  this.v=new T.Vector3();this.q=new T.Vector3();this.axis=new T.Vector3();this.delta=new T.Vector3();this.original=new T.Vector3();this.target=new T.Vector3();this.saved=new T.Vector3();
  this.blend=new T.Matrix4();this.boneMatrix=new T.Matrix4();this.skin=new T.Matrix4();this.inverse=new T.Matrix4();this.tick=0;
  if(!this.items.length||this.capsules.length!==2)throw new Error('Missing skirt collision rig');
 }
 reset(){for(const item of this.items){item.offset.fill(0);const p=item.mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,item.rest[i*3],item.rest[i*3+1],item.rest[i*3+2]);item.mesh.geometry.attributes.position.needsUpdate=true;item.mesh.geometry.computeVertexNormals();}}
 project(p){let hit=false;for(let pass=0;pass<3;pass++)for(const c of this.capsules){
  this.axis.subVectors(c.end,c.start);const t=T.MathUtils.clamp(this.q.subVectors(p,c.start).dot(this.axis)/this.axis.lengthSq(),0,1);
  this.q.copy(c.start).addScaledVector(this.axis,t);this.delta.subVectors(p,this.q);const distance=this.delta.length(),radius=T.MathUtils.lerp(c.r0,c.r1,t)+this.padding;
  if(distance<radius){if(distance<1e-7)this.delta.set(0,0,1);else this.delta.multiplyScalar(1/distance);const projected=radius+0.002*Math.exp((distance-radius)/0.004);p.copy(this.q).addScaledVector(this.delta,projected);hit=true;}
 }return hit;}
 update(dt=1/60){
  if(!this.enabled)return;
  this.root.updateMatrixWorld(true);for(const c of this.capsules){c.a.getWorldPosition(c.start);c.b.getWorldPosition(c.end);}
  this.stats.contacts=0;this.stats.maxCorrection=0;const decay=Math.exp(-Math.min(dt,.05)*18);
  for(const item of this.items){const m=item.mesh,g=m.geometry,p=g.attributes.position,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;m.skeleton.update();
   for(let i=0;i<p.count;i++){
    this.blend.elements.fill(0);
    for(let j=0;j<4;j++){const w=weights.getComponent(i,j);if(!w)continue;this.boneMatrix.fromArray(m.skeleton.boneMatrices,indices.getComponent(i,j)*16);for(let k=0;k<16;k++)this.blend.elements[k]+=this.boneMatrix.elements[k]*w;}
    this.skin.copy(m.matrixWorld).multiply(m.bindMatrixInverse).multiply(this.blend).multiply(m.bindMatrix);
    this.original.fromArray(item.rest,i*3).applyMatrix4(this.skin);this.target.copy(this.original);
    // Smooth only the release; penetration is projected out immediately.
    this.saved.fromArray(item.offset,i*3).multiplyScalar(decay);this.target.add(this.saved);
    if(this.project(this.target))this.stats.contacts++;
    this.saved.subVectors(this.target,this.original);this.saved.toArray(item.offset,i*3);this.stats.maxCorrection=Math.max(this.stats.maxCorrection,this.saved.length());
    this.inverse.copy(this.skin).invert();this.v.copy(this.target).applyMatrix4(this.inverse);p.setXYZ(i,this.v.x,this.v.y,this.v.z);
   }
   p.needsUpdate=true;if(this.tick%3===0)g.computeVertexNormals();m.frustumCulled=false;
  }this.tick++;
 }
}
