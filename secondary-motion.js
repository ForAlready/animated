import * as T from 'three';

// Bounded angular springs preserve bone lengths and the authored rest volume.
export class SecondaryMotion {
 constructor(root,controls){
  this.controls=controls;this.enabled=true;this.strength=1;this.items=[];this.rotation=new T.Quaternion();this.euler=new T.Euler();
  root.traverse(b=>{
   if(!b.isBone)return;
   const name=b.name.split('__').at(-1);
   const hair=b.name.startsWith('SK_Role1_Hair01__')&&/Hair.*_\d\d$/.test(name);
   const skirt=/Skirt.*\d+$/i.test(name)&&/Skirt/i.test(b.parent?.name||'');
   const accessory=/(Chain|Ribbon|Strap).*\d+$/i.test(name)&&/(Chain|Ribbon|Strap)/i.test(b.parent?.name||'');
   if(!hair&&!skirt&&!accessory)return;
   const depth=Number(name.match(/(\d+)$/)[1]);if((hair&&depth<3)||(!hair&&depth<2))return;
   this.items.push({bone:b,rest:b.quaternion.clone(),base:new T.Quaternion(),parentQ:new T.Quaternion(),lastParent:new T.Quaternion(),deltaQ:new T.Quaternion(),parentReady:false,x:0,y:0,vx:0,vy:0,k:hair?65:45,d:hair?11:9,gain:hair?.0025:.010,limit:hair?.012:.045});
  });this.reset();
 }
 reset(){this.yaw=this.controls.getAzimuthalAngle();this.pitch=this.controls.getPolarAngle();for(const s of this.items){s.x=s.y=s.vx=s.vy=0;s.parentReady=false;s.bone.quaternion.copy(s.rest);}}
 update(dt,motion={}){
  const yaw=this.controls.getAzimuthalAngle(),pitch=this.controls.getPolarAngle();
  let delta=yaw-this.yaw;delta=Math.atan2(Math.sin(delta),Math.cos(delta));const dp=pitch-this.pitch;this.yaw=yaw;this.pitch=pitch;
  if(!this.enabled)return;
  dt=T.MathUtils.clamp(dt,1/240,.05);const horizontal=T.MathUtils.clamp(delta/dt,-5,5)*this.strength,vertical=T.MathUtils.clamp(dp/dt+(motion.vertical||0)*1.5,-3,3)*this.strength;
  const steps=Math.ceil(dt*120),h=dt/steps;
  for(const s of this.items){
   if(s.profile){s.k=s.profile.stiffness*Math.pow(s.profile.frequency/2,2)/s.profile.mass;s.d=(s.profile.damping+s.profile.drag)/s.profile.mass/(1+s.profile.bounce);s.limit=s.profile.maxAngle;}
   s.base.copy(s.bone.quaternion);s.bone.parent.getWorldQuaternion(s.parentQ);
   let turn=0,tilt=0;if(s.parentReady){s.deltaQ.copy(s.lastParent).invert().multiply(s.parentQ);this.euler.setFromQuaternion(s.deltaQ);turn=T.MathUtils.clamp(this.euler.y/dt,-4,4);tilt=T.MathUtils.clamp(this.euler.x/dt,-4,4)}s.lastParent.copy(s.parentQ);s.parentReady=true;
   const tx=T.MathUtils.clamp(-(vertical+tilt)*s.gain*((s.profile?.inertia??.12)/.12)-(s.profile?.gravity||0)*.01,-s.limit,s.limit),ty=T.MathUtils.clamp(-(horizontal+turn)*s.gain*((s.profile?.inertia??.12)/.12),-s.limit,s.limit);
   for(let n=0;n<steps;n++){
    s.vx+=(s.k*(tx-s.x)-s.d*s.vx)*h;s.vy+=(s.k*(ty-s.y)-s.d*s.vy)*h;s.x+=s.vx*h;s.y+=s.vy*h;
    if(Math.abs(s.x)>s.limit){s.x=Math.sign(s.x)*s.limit;s.vx=0}if(Math.abs(s.y)>s.limit){s.y=Math.sign(s.y)*s.limit;s.vy=0}
   }
   this.euler.set(0,s.y,s.x);this.rotation.setFromEuler(this.euler);s.bone.quaternion.copy(s.base).multiply(this.rotation);
  }
 }
}
