import * as T from '../vendor/three.module.js';
// Reusable state, semi-implicit substeps capped at 1/180 s.
export class SpringState {
 constructor(){this.x=new T.Vector3();this.v=new T.Vector3();this.force=new T.Vector3();}
 reset(){this.x.set(0,0,0);this.v.set(0,0,0);}
 step(dt,acceleration,p,strength=1){
  if(!Number.isFinite(dt)||dt>.1||dt<0){this.reset();return;}
  const count=Math.max(1,Math.ceil(dt*180)),h=dt/count;
  const k=p.stiffness*Math.pow(p.frequency/2,2)/p.mass;
  const d=(p.damping+p.drag)/p.mass/(1+p.bounce);
  for(let i=0;i<count;i++){
   this.force.copy(acceleration).multiplyScalar(-p.inertia*strength).addScaledVector(this.x,-k).addScaledVector(this.v,-d);
   this.force.y-=9.81*p.gravity;
   this.v.addScaledVector(this.force,h);this.x.addScaledVector(this.v,h);
   if(this.x.lengthSq()>p.maxOffset*p.maxOffset){this.x.clampLength(0,p.maxOffset);this.v.multiplyScalar(p.bounce);}
  }
 }
}
