import * as T from 'three';
const ease=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x)};
const V=a=>new T.Vector3(...a);
export class CharacterActions {
 constructor(root,mixer,idleClip,outfitId,registry){
  this.root=root;this.mixer=mixer;this.idleClip=idleClip;this.outfitId=outfitId;this.registry=registry;
  this.bones=[];this.master={};this.groups=new Map();this.faces=[];this.origin=root.position.clone();this.time=0;this.transition=1;this.previous=null;
  root.traverse(b=>{
   if(b.isBone){const name=b.name.split('__').at(-1);const item={bone:b,name,q:b.quaternion.clone(),p:b.position.clone()};this.bones.push(item);if(!this.groups.has(name))this.groups.set(name,[]);this.groups.get(name).push(item);if(b.name.startsWith('SK_Role1_Body__'))this.master[name]=b;}
   if(b.isMesh&&b.morphTargetDictionary&&b.name && Object.hasOwn(b.morphTargetDictionary,'mouthSmileLeft'))this.faces.push(b);
  });
  for(const n of ['Shoulder_L','Elbow_L','Wrist_L','Shoulder_R','Elbow_R','Wrist_R'])if(!this.master[n])throw new Error('Missing action bone: '+n);
  if(!this.faces.length)throw new Error('Actions require facial morph targets');
  this.base=this.bones.map(s=>({q:s.q.clone(),p:s.p.clone()}));this.baseFaces=this.faces.map(m=>m.morphTargetInfluences.slice());this.play('idle',true);
 }
 play(id,immediate=false){const r=this.registry.resolve(id,this.outfitId);this.definition=r.action;this.layer=r.layer;this.id=r.action.id;this.fallback=!!r.fallback;this.time=0;this.transition=immediate?1:0;if(immediate)this.previous=null;return this.id;}
 get duration(){return this.definition.duration}
 beforeUpdate(){for(let i=0;i<this.bones.length;i++){this.bones[i].bone.quaternion.copy(this.base[i].q);this.bones[i].bone.position.copy(this.base[i].p)}this.root.position.copy(this.origin);for(let i=0;i<this.faces.length;i++)this.faces[i].morphTargetInfluences.splice(0,this.baseFaces[i].length,...this.baseFaces[i]);}
 world(b){return b.getWorldPosition(new T.Vector3())}
 rotateWorld(bone,axis,angle){if(!bone||!angle)return;this.root.updateMatrixWorld(true);const parent=bone.parent.getWorldQuaternion(new T.Quaternion());const dq=new T.Quaternion().setFromAxisAngle(V(axis),angle);bone.quaternion.premultiply(parent.clone().invert().multiply(dq).multiply(parent));this.root.updateMatrixWorld(true);}
 aim(bone,child,target){this.root.updateMatrixWorld(true);const origin=this.world(bone),from=this.world(child).sub(origin).normalize(),to=target.clone().sub(origin).normalize();const delta=new T.Quaternion().setFromUnitVectors(from,to),parent=bone.parent.getWorldQuaternion(new T.Quaternion());bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));this.root.updateMatrixWorld(true);}
 ik(a,b,c,target,pole){
  const A=this.master[a],B=this.master[b],C=this.master[c];if(!A||!B||!C)return;
  this.root.updateMatrixWorld(true);const p=this.world(A),pb=this.world(B),pc=this.world(C),l1=p.distanceTo(pb),l2=pb.distanceTo(pc);
  const direction=target.clone().sub(p),length=T.MathUtils.clamp(direction.length(),Math.abs(l1-l2)+.005,l1+l2-.005);direction.normalize();target=p.clone().addScaledVector(direction,length);
  const bend=pole.clone().sub(p);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<1e-8)bend.set(0,0,1);bend.normalize();
  const x=(l1*l1-l2*l2+length*length)/(2*length),height=Math.sqrt(Math.max(0,l1*l1-x*x));const elbow=p.clone().addScaledVector(direction,x).addScaledVector(bend,height);
  this.aim(A,B,elbow);this.aim(B,C,target);
 }
 fingers(side,mode){
  const sign=side==='L'?-1:1;
  let palmNormal;
  if(mode==='point'){
   this.root.updateMatrixWorld(true);
   const wrist=this.world(this.master['Wrist_'+side]);
   palmNormal=this.world(this.master['IndexFinger1_'+side]).sub(wrist).cross(this.world(this.master['PinkyFinger1_'+side]).sub(wrist)).normalize();
   // In the shy pose the backs of both hands face forward.
   if(palmNormal.z>0)palmNormal.negate();
  }
  for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let n=1;n<=3;n++){
   const bone=this.master[finger+'Finger'+n+'_'+side];if(!bone)continue;
   let curl=mode==='fist'?(n===3?.85:1.35):mode==='soft'?.35:mode==='open'?.07:.95;
   if(mode==='point'&&finger==='Index')curl=.03;
   // Pointing uses a relaxed hand, not the three-joint fist curl.
   // Keep the thumb's authored opposition: aiming it at the middle knuckle
   // folds the thumb through the palm on this rig.
   if(mode==='point')curl=finger==='Index'?[.06,.12,.08][n-1]:finger==='Thumb'?.10:[.52,.68,.38][n-1];
   if(mode==='victory'&&['Index','Middle'].includes(finger))curl=.02;
   if(finger==='Thumb')curl*=.5;
   if(mode==='point'&&finger!=='Thumb'){
    const next=this.master[finger+'Finger'+(n+1)+'_'+side];
    if(n===1&&finger!=='Index'&&next){
     const center=this.world(this.master['IndexFinger2_'+side]).sub(this.world(this.master['IndexFinger1_'+side])).normalize();
     const direction=this.world(next).sub(this.world(bone)).normalize().lerp(center,.55).normalize();
     this.aim(bone,next,this.world(bone).add(direction));
    }
    if(next&&curl){
     this.root.updateMatrixWorld(true);
     const tangent=this.world(next).sub(this.world(bone)).normalize();
     const axis=tangent.cross(palmNormal).normalize().applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()).invert());
     bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(axis,curl));
    }
   }else bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),sign*curl));
   if(mode==='victory'&&n===1&&['Index','Middle'].includes(finger))bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),(finger==='Index'?1:-1)*.13));
  }
  if(['fist','victory'].includes(mode)){
   const thumb=this.master['ThumbFinger1_'+side],next=this.master['ThumbFinger2_'+side],middle=this.master['MiddleFinger1_'+side];
   if(thumb&&next&&middle)this.aim(thumb,next,this.world(middle));
  }
 }
 body(p){
  if(!p)return;
  const b=this.master;this.root.updateMatrixWorld(true);const feet={L:this.world(b.Ankle_L),R:this.world(b.Ankle_R)};
  this.rotateWorld(b.Chest_M,[0,1,0],p.turn||0);this.rotateWorld(b.Chest_M,[1,0,0],p.lean||0);this.rotateWorld(b.Head_M,[1,0,0],p.headNod||0);this.rotateWorld(b.Head_M,[0,0,1],p.headTilt||0);
  for(const side of ['L','R']){
   const i=side==='L'?0:1,sgn=side==='L'?1:-1;
   if(p.shoulders){const scap=b['Scapula_'+side];const parent=scap.parent.getWorldQuaternion(new T.Quaternion()).invert();scap.position.add(new T.Vector3(0,p.shoulders,0).applyQuaternion(parent));}
   const target=p.arms[i].slice();if(p.hands==='point'){target[0]=sgn*(.11+(p.tap||0));}
   this.ik('Shoulder_'+side,'Elbow_'+side,'Wrist_'+side,V(target),V(p.poles[i]));
   if(p.hands==='point'){
    const wrist=b['Wrist_'+side],index=b['IndexFinger1_'+side],tip=b['IndexFinger4_'+side];
    if(index&&tip){
     const align=()=>{this.root.updateMatrixWorld(true);const dir=this.world(tip).sub(this.world(index)).normalize();const dq=new T.Quaternion().setFromUnitVectors(dir,new T.Vector3(-sgn,-.16,side==='L'?-.10:.06).normalize());const parent=wrist.parent.getWorldQuaternion(new T.Quaternion());wrist.quaternion.premultiply(parent.clone().invert().multiply(dq).multiply(parent));this.root.updateMatrixWorld(true)};
     align();const desired=new T.Vector3(sgn*(.005+Math.abs(p.tap||0))+.016,1.12+(side==='L'?.006:-.006),side==='L'?.209:.198);const corrected=this.world(wrist).add(desired.sub(this.world(tip)));
     this.ik('Shoulder_'+side,'Elbow_'+side,'Wrist_'+side,corrected,V(p.poles[i]));align();
    }
   }
   this.fingers(side,p.hands);
   if(p.crouch||p.knees||p.sway||p.bounce){const at=feet[side];at.y+=(p.crouch||0)-(p.bounce||0);at.x-=p.sway||0;this.ik('Hip_'+side,'Knee_'+side,'Ankle_'+side,at,new T.Vector3(sgn*.055,.48,.20));}
  }
  if(p.toe){this.rotateWorld(b.Ankle_L,[0,1,0],-.22);this.rotateWorld(b.Ankle_L,[1,0,0],.14);}
  // Synchronize the shared pose to every garment/head/hair skeleton.
  for(const [name,master] of Object.entries(b))for(const copy of this.groups.get(name)||[]){if(copy.bone!==master){copy.bone.quaternion.copy(master.quaternion);const original=this.bones.find(s=>s.bone===master);copy.bone.position.copy(copy.p).add(master.position.clone().sub(original.p));}}
  this.root.position.y+=(p.jump||0)+(p.bounce||0)-(p.crouch||0);this.root.position.x+=p.sway||0;
 }
 update(dt,{seek=false}={}){
  if(!seek){this.time+=dt;this.transition=Math.min(1,this.transition+dt/.3);}
  if(!this.definition.loop&&this.time>=this.duration&&!seek){this.play('idle');}
  if(this.definition.loop)this.time%=this.duration;
  const t=this.time,base=this.bones.map(s=>({q:s.bone.quaternion.clone(),p:s.bone.position.clone()}));this.base=base;this.baseFaces=this.faces.map(m=>m.morphTargetInfluences.slice());const rootBase=this.root.position.clone();
  const passthrough=this.id==='idle'&&this.layer==='common';
  const envelope=passthrough?0:(this.definition.loop?1:ease(t/.4)*ease((this.duration-t)/.45));
  if(!passthrough){
   const pose=this.definition.body(t);const face=this.definition.face(t);if(!pose||!face)throw new Error('Action must provide both body and face');
   this.body(pose);
   // The oral mesh uses separate joints rather than the lip morph rig.
   const grin=Math.max(face.mouthSmileLeft||0,face.mouthSmileRight||0),jaw=face.jawOpen||0;
   if(grin>.4&&jaw>0){
    this.root.updateMatrixWorld(true);
    for(const [name,offset] of [['faceMdToothUpJoint',[0,-.001*grin,.005*grin]],['faceMdToothDnJoint',[0,-.007*jaw,.003*grin]]])for(const item of this.groups.get(name)||[]){
     const inverse=item.bone.parent.getWorldQuaternion(new T.Quaternion()).invert();item.bone.position.add(V(offset).applyQuaternion(inverse));
    }
   }
   for(let i=0;i<this.bones.length;i++){this.bones[i].bone.quaternion.slerpQuaternions(base[i].q,this.bones[i].bone.quaternion.clone(),envelope);this.bones[i].bone.position.lerpVectors(base[i].p,this.bones[i].bone.position,envelope)}this.root.position.lerpVectors(rootBase,this.root.position,envelope);
   for(const mesh of this.faces)for(const [name,index] of Object.entries(mesh.morphTargetDictionary)){const idle=mesh.morphTargetInfluences[index]||0;mesh.morphTargetInfluences[index]=T.MathUtils.lerp(idle,T.MathUtils.clamp(face[name]||0,0,1),envelope);}
  }
  if(this.previous&&this.transition<1){const f=ease(this.transition);for(let i=0;i<this.bones.length;i++){this.bones[i].bone.quaternion.slerpQuaternions(this.previous.bones[i].q,this.bones[i].bone.quaternion.clone(),f);this.bones[i].bone.position.lerpVectors(this.previous.bones[i].p,this.bones[i].bone.position,f)}this.root.position.lerpVectors(this.previous.position,this.root.position,f);for(let i=0;i<this.faces.length;i++)this.faces[i].morphTargetInfluences.forEach((v,j,a)=>a[j]=T.MathUtils.lerp(this.previous.faces[i][j],v,f));}
  this.previous={bones:this.bones.map(s=>({q:s.bone.quaternion.clone(),p:s.bone.position.clone()})),position:this.root.position.clone(),faces:this.faces.map(m=>m.morphTargetInfluences.slice())};
 }
 seek(t){this.time=T.MathUtils.clamp(t,0,this.duration);this.transition=1;this.beforeUpdate();this.mixer.setTime(t);this.update(0,{seek:true});}
 dispose(){this.previous=null;}
}
