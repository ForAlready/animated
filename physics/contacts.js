import * as T from '../vendor/three.module.js';
// Sparse arm contacts against the torso. Uses existing two-bone IK; no mesh queries.
export class ArmContacts {
 constructor(actions,rig){this.actions=actions;this.rig=rig;this.enabled=true;this.padding=.022;this.contacts=0;this.target=new T.Vector3();this.original=new T.Vector3();this.pole=new T.Vector3();this.delta=new T.Vector3();this.sample=new T.Vector3();this.projected=new T.Vector3();this.correction=new T.Vector3();this.knee=new T.Vector3();this.hip=new T.Vector3();this.colliders=rig.items.filter(c=>['Chest','Torso','Hip'].includes(c.name));}
 update(){
  this.contacts=0;if(!this.enabled)return;
  const a=this.actions;a.root.updateMatrixWorld(true);
  for(const side of ['L','R']){
   const wrist=a.master['Wrist_'+side],elbow=a.master['Elbow_'+side];if(!wrist||!elbow)continue;
   wrist.getWorldPosition(this.original);this.target.copy(this.original);elbow.getWorldPosition(this.pole);
   for(let pass=0;pass<2;pass++)for(const c of this.colliders)if(c.project(this.target,this.padding))this.contacts++;
   // Sample the forearm segment as well as its wrist endpoint.
   for(const t of [.25,.5,.75]){this.sample.lerpVectors(this.pole,this.original,t);this.projected.copy(this.sample);for(const c of this.colliders)if(c.project(this.projected,.026))this.contacts++;this.correction.subVectors(this.projected,this.sample);this.target.addScaledVector(this.correction,.5);}
   this.delta.subVectors(this.target,this.original).clampLength(0,.045);if(this.delta.lengthSq()<1e-10)continue;
   this.target.copy(this.original).add(this.delta);a.ik('Shoulder_'+side,'Elbow_'+side,'Wrist_'+side,this.target,this.pole);
   for(const name of ['Shoulder_'+side,'Elbow_'+side])for(const item of a.groups.get(name)||[])item.bone.quaternion.copy(a.master[name].quaternion);
  }
  for(const side of ['L','R']){const hip=a.master['Hip_'+side],knee=a.master['Knee_'+side],other=this.rig.items.find(c=>c.name==='Thigh_'+(side==='L'?'R':'L'));if(!hip||!knee||!other)continue;hip.getWorldPosition(this.hip);knee.getWorldPosition(this.knee);this.sample.lerpVectors(this.hip,this.knee,.65);this.projected.copy(this.sample);if(other.project(this.projected,.045)){this.contacts++;this.delta.subVectors(this.projected,this.sample).clampLength(0,.012);this.target.copy(this.knee).add(this.delta);a.aim(hip,knee,this.target);for(const item of a.groups.get('Hip_'+side)||[])item.bone.quaternion.copy(hip.quaternion)}}
 }
}
