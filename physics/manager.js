import {ChainContacts,PhysicsDebug} from './debug.js';
import {resolveParameters,resolveBoneConfig} from './config.js';
export class PhysicsManager {
 constructor({root,bounce,secondary,cloth,contacts,colliders,scene,config={}}){Object.assign(this,{root,bounce,secondary,cloth,contacts,colliders});this.enabled=true;this.tick=0;this.clothTime=0;this.stillTime=0;this.lastY=root.position.y;this.lastAction=null;this.stats={milliseconds:0,lod:'near'};
  for(const s of bounce.items)s.parameters=resolveBoneConfig(s.name,config);
  secondary.items=secondary.items.filter(s=>resolveBoneConfig(s.bone.name.split('__').at(-1),config));
  for(const s of secondary.items){const p=resolveBoneConfig(s.bone.name.split('__').at(-1),config);s.k=p.stiffness/p.mass;s.d=(p.damping+p.drag)/p.mass;s.limit=p.maxAngle;s.profile=p;}this.chainContacts=new ChainContacts(secondary,colliders);this.debug=new PhysicsDebug(root,secondary.items,scene);
 }
 reset(){this.bounce.reset();this.secondary.reset();this.cloth.reset();this.lastY=this.root.position.y;this.clothTime=0;this.stillTime=0;}
 update(dt,{distance=0,playing=true,actionId='idle'}={}){
  const started=performance.now();if(!Number.isFinite(dt)||dt>.1||dt<=0){this.reset();return;}
  if(this.lastAction!==actionId){this.bounce.reset();this.lastAction=actionId;}
  this.colliders.update();if(!this.enabled){this.bounce.reset();this.stats.milliseconds=performance.now()-started;return;}
  this.contacts.update();this.colliders.update();
  // Physical time remains real time when animation pauses or playback speed changes.
  if(this.bounce.enabled!==false)this.bounce.update(dt,this.secondary.strength);else this.bounce.reset();
  const vertical=(this.root.position.y-this.lastY)/dt;this.lastY=this.root.position.y;
  this.secondary.update(dt,{vertical});this.chainContacts.update();this.debug.update();
  this.stillTime=playing?0:this.stillTime+dt;const stride=distance>6?4:distance>3||this.stillTime>2?2:1;
  this.stats.lod=stride===1?'near':stride===2?'reduced':'far';this.clothTime+=dt;
  if(this.tick++%stride===0){this.cloth.update(Math.min(this.clothTime,.1));this.clothTime=0;}
  this.stats.milliseconds=performance.now()-started;
 }
 dispose(){this.debug.dispose();this.colliders.dispose();}
}
