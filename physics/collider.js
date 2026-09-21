import * as T from '../vendor/three.module.js';
// A sphere is a capsule with coincident endpoints. No triangle queries.
export class CapsuleCollider {
 constructor(name,start,end,radius){this.name=name;this.start=start;this.end=end||start;this.radius=radius;this.a=new T.Vector3();this.b=new T.Vector3();this.axis=new T.Vector3();this.closest=new T.Vector3();this.normal=new T.Vector3();}
 update(){this.start.getWorldPosition(this.a);this.end.getWorldPosition(this.b);this.axis.subVectors(this.b,this.a);}
 project(point,padding=0){const l=this.axis.lengthSq();const t=l?T.MathUtils.clamp(this.closest.subVectors(point,this.a).dot(this.axis)/l,0,1):0;this.closest.copy(this.a).addScaledVector(this.axis,t);this.normal.subVectors(point,this.closest);const d=this.normal.length(),r=this.radius+padding;if(d>=r)return false;if(d<1e-8)this.normal.set(0,0,1);else this.normal.multiplyScalar(1/d);point.copy(this.closest).addScaledVector(this.normal,r);return true;}
}
export class ColliderRig {
 constructor(root){this.items=[];this.debug=new T.Group();this.debug.visible=false;const bones={};root.traverse(b=>{if(b.isBone&&b.name.startsWith('SK_Role1_Body__'))bones[b.name.split('__').at(-1)]=b});
 const add=(name,a,b,r)=>{if(bones[a]&&bones[b||a])this.items.push(new CapsuleCollider(name,bones[a],bones[b||a],r))};
 add('Head','Head_M',null,.085);add('Chest','Spine4_M','Chest_M',.105);add('Torso','Spine1_M','Spine3_M',.085);add('Hip','Pelvis_M',null,.09);
 for(const side of ['L','R']){add('UpperArm_'+side,'Shoulder_'+side,'Elbow_'+side,.035);add('ForeArm_'+side,'Elbow_'+side,'Wrist_'+side,.026);add('Thigh_'+side,'Hip_'+side,'Knee_'+side,.055);add('Leg_'+side,'Knee_'+side,'Ankle_'+side,.035)}
 this.geometry=new T.SphereGeometry(1,8,6);this.material=new T.MeshBasicMaterial({color:0x36ddb0,wireframe:true,depthTest:false});
 for(const c of this.items){c.helpers=[0,.5,1].map(()=>{const m=new T.Mesh(this.geometry,this.material);this.debug.add(m);return m})}
 }
 update(){for(const c of this.items){c.update();if(this.debug.visible)c.helpers.forEach((m,i)=>{m.position.lerpVectors(c.a,c.b,i*.5);m.scale.setScalar(c.radius)})}}
 dispose(){this.debug.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
