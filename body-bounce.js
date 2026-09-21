import * as T from 'three';
import {SpringState} from './physics/spring.js';
import {DEFAULT_PHYSICS_CONFIG,resolveBoneConfig} from './physics/config.js';
// Animation owns the base pose; only auxiliary bones receive offsets.
export class BodyBounce {
 constructor(root,config=DEFAULT_PHYSICS_CONFIG){
  this.root=root;this.config=config;this.items=[];const groups=new Map();
  root.traverse(b=>{if(!b.isBone)return;const n=b.name.split('__').at(-1),p=resolveBoneConfig(n,config);if(!p||p.category!=='bodySoft')return;if(!groups.has(n))groups.set(n,[]);groups.get(n).push(b)});
  for(const [name,bones] of groups){const driver=bones.find(b=>b.name.startsWith('SK_Role1_Body__'))||bones[0];const spring=new SpringState();this.items.push({name,bones,driver,spring,x:spring.x,v:spring.v,parameters:resolveBoneConfig(name,config),last:new T.Vector3(),sample:new T.Vector3(),velocity:new T.Vector3(),nextVelocity:new T.Vector3(),acceleration:new T.Vector3(),offset:new T.Vector3(),inverse:new T.Quaternion(),initialized:false});}
 }
 reset(){for(const s of this.items){s.spring.reset();s.initialized=false;s.velocity.set(0,0,0)}}
 update(dt,strength=1){
  if(!(dt>0)||!Number.isFinite(dt)||dt>.1){this.reset();return;}
  this.root.updateMatrixWorld(true);for(const s of this.items)s.driver.getWorldPosition(s.sample);
  for(const s of this.items){
   if(!s.initialized){s.last.copy(s.sample);s.initialized=true;continue;}
   s.nextVelocity.subVectors(s.sample,s.last).divideScalar(dt);s.last.copy(s.sample);
   s.acceleration.subVectors(s.nextVelocity,s.velocity).divideScalar(dt).clampLength(0,12);s.velocity.copy(s.nextVelocity);
   s.spring.step(dt,s.acceleration,s.parameters,T.MathUtils.clamp(strength,0,2));
   for(const bone of s.bones){bone.parent.getWorldQuaternion(s.inverse).invert();bone.position.add(s.offset.copy(s.x).applyQuaternion(s.inverse));}
  }
 }
}
