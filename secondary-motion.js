import * as T from 'three';

// Bounded angular springs preserve bone lengths and the authored rest volume.
// Drive = OrbitControls angular rate + body Chest/Head world angular rate (animation).
export class SecondaryMotion {
 constructor(root,controls){
  this.root=root;this.controls=controls;this.enabled=true;this.strength=1;this.items=[];
  this.rotation=new T.Quaternion();this.euler=new T.Euler();
  this.chest=null;this.head=null;
  this._chestQ=new T.Quaternion();this._headQ=new T.Quaternion();
  this._prevChestQ=new T.Quaternion();this._prevHeadQ=new T.Quaternion();
  this._deltaQ=new T.Quaternion();
  // How strongly skeleton motion feeds the same spring targets as the camera.
  this.boneDrive=1;
  root.traverse(b=>{
   if(!b.isBone)return;
   const name=b.name.split('__').at(-1);
   if(b.name.startsWith('SK_Role1_Body__')){
    if(name==='Chest_M')this.chest=b;
    if(name==='Head_M')this.head=b;
   }
   const hair=b.name.startsWith('SK_Role1_Hair01__')&&/Hair.*_\d\d$/.test(name);
   const skirt=b.name.startsWith('SK_Role1_Suit13_Skirt__')&&/Skirt_.*_Jnt[234]$/.test(name);
   if(!hair&&!skirt)return;
   const depth=Number(name.match(/(\d+)$/)[1]);if(hair&&depth<3)return;
   this.items.push({bone:b,rest:b.quaternion.clone(),x:0,y:0,vx:0,vy:0,k:hair?65:45,d:hair?11:9,gain:hair?.0025:.010,limit:hair?.012:.045});
  });this.reset();
 }
 sampleDrivers(){
  this.root.updateMatrixWorld(true);
  if(this.chest)this.chest.getWorldQuaternion(this._prevChestQ);
  if(this.head)this.head.getWorldQuaternion(this._prevHeadQ);
 }
 reset(){
  this.yaw=this.controls.getAzimuthalAngle();this.pitch=this.controls.getPolarAngle();
  this.sampleDrivers();
  for(const s of this.items){s.x=s.y=s.vx=s.vy=0;s.bone.quaternion.copy(s.rest);}
 }
 // World-quat delta → approximate yaw (Y) / pitch (X) rate in rad/s.
 driverRate(prev,curr,dt){
  this._deltaQ.copy(prev).invert().multiply(curr);
  this.euler.setFromQuaternion(this._deltaQ,'YXZ');
  prev.copy(curr);
  return {
   yaw:T.MathUtils.clamp(this.euler.y/dt,-5,5),
   pitch:T.MathUtils.clamp(this.euler.x/dt,-3,3)
  };
 }
 update(dt,motion={}){
  const yaw=this.controls.getAzimuthalAngle(),pitch=this.controls.getPolarAngle();
  let delta=yaw-this.yaw;delta=Math.atan2(Math.sin(delta),Math.cos(delta));const dp=pitch-this.pitch;this.yaw=yaw;this.pitch=pitch;
  if(!this.enabled)return;
  dt=T.MathUtils.clamp(dt,1/240,.05);

  let boneYaw=0,bonePitch=0;
  this.root.updateMatrixWorld(true);
  if(this.chest){
   this.chest.getWorldQuaternion(this._chestQ);
   const r=this.driverRate(this._prevChestQ,this._chestQ,dt);
   boneYaw+=r.yaw;bonePitch+=r.pitch;
  }
  if(this.head){
   this.head.getWorldQuaternion(this._headQ);
   const r=this.driverRate(this._prevHeadQ,this._headQ,dt);
   // Head contributes less so neck fidget does not whip hair.
   boneYaw+=r.yaw*.45;bonePitch+=r.pitch*.45;
  }

  const horizontal=T.MathUtils.clamp(
   delta/dt+(motion.horizontal||0)+boneYaw*this.boneDrive,-5,5
  )*this.strength;
  const vertical=T.MathUtils.clamp(
   dp/dt+(motion.vertical||0)*1.5+bonePitch*this.boneDrive,-3,3
  )*this.strength;

  const steps=Math.ceil(dt*120),h=dt/steps;
  for(const s of this.items){
   const tx=T.MathUtils.clamp(-vertical*s.gain,-s.limit,s.limit),ty=T.MathUtils.clamp(-horizontal*s.gain,-s.limit,s.limit);
   for(let n=0;n<steps;n++){
    s.vx+=(s.k*(tx-s.x)-s.d*s.vx)*h;s.vy+=(s.k*(ty-s.y)-s.d*s.vy)*h;s.x+=s.vx*h;s.y+=s.vy*h;
    if(Math.abs(s.x)>s.limit){s.x=Math.sign(s.x)*s.limit;s.vx=0}if(Math.abs(s.y)>s.limit){s.y=Math.sign(s.y)*s.limit;s.vy=0}
   }
   this.euler.set(0,s.y,s.x);this.rotation.setFromEuler(this.euler);s.bone.quaternion.copy(s.rest).multiply(this.rotation);
  }
 }
}
