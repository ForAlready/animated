// SI units: meters, seconds, radians. Presets are immutable; resolve per bone.
const base={stiffness:150,damping:17,mass:1,gravity:0,drag:.8,inertia:.12,maxAngle:.12,maxOffset:.009,bounce:.2,frequency:2,collisionRadius:.012};
const preset=values=>Object.freeze({...base,...values});
export const PHYSICS_PRESETS=Object.freeze({
 soft:preset({stiffness:80,damping:10,maxAngle:.2}),
 normal:preset({}),
 hard:preset({stiffness:240,damping:25,inertia:.04,maxAngle:.05,bounce:.05}),
 skirt:preset({stiffness:65,damping:11,inertia:.18,maxAngle:.22,collisionRadius:.025}),
 coat:preset({stiffness:180,damping:22,inertia:.06,maxAngle:.08,bounce:.08}),
 ribbon:preset({stiffness:70,damping:7,mass:.3,frequency:3,drag:1.5,maxAngle:.3}),
 hair:preset({stiffness:85,damping:12,mass:.5,maxAngle:.16,collisionRadius:.008}),
 bodySoft:preset({stiffness:150,damping:17,maxAngle:.06,maxOffset:.009})
});
const limits={stiffness:[1,500],damping:[1,60],mass:[.1,5],gravity:[0,2],drag:[0,10],inertia:[0,1],maxAngle:[0,.6],maxOffset:[0,.03],bounce:[0,.8],frequency:[.2,8],collisionRadius:[.001,.1]};
export function resolveParameters(name='normal',override={}){
 const p={...(PHYSICS_PRESETS[name]||PHYSICS_PRESETS.normal)};
 for(const [key,[lo,hi]] of Object.entries(limits))if(Number.isFinite(override[key]))p[key]=Math.min(hi,Math.max(lo,override[key]));
 return p;
}
// Never infer a primary animation joint as soft merely from Chest/Arm/Thigh.
const primary=/^(Root|Pelvis|Spine\d*|Chest|Head|Neck|Scapula|Shoulder|Elbow|Wrist|Hip|Knee|Ankle|Toes)(_[MLR])?$/i;
export function classifyBone(name){
 if(primary.test(name))return null;
 if(/Hair/i.test(name))return 'hair';
 if(/Skirt/i.test(name))return 'skirt';
 if(/Ribbon|Chain|Pendant|Strap/i.test(name))return 'ribbon';
 if(/^(Boom_[LR]|AssRoot_[LR])$/.test(name)||/Bust|Breast|Soft|Jiggle|Spring|Secondary/i.test(name))return 'bodySoft';
 return null;
}
export const DEFAULT_PHYSICS_CONFIG=Object.freeze({autoDetect:true,body:{enabled:true,preset:'bodySoft'},hair:{enabled:true,preset:'hair'},clothing:{enabled:true,preset:'normal'},bones:{}});
export function resolveBoneConfig(name,config=DEFAULT_PHYSICS_CONFIG){
 const manual=config.bones?.[name];if(manual?.enabled===false)return null;
 // Primary joints remain protected even from broad automatic matching.
 if(primary.test(name))return null;
 const type=manual?.category||(config.autoDetect!==false?classifyBone(name):null)||(manual?.preset?'bodySoft':null);if(!type)return null;
 const section=type==='bodySoft'?config.body:type==='hair'?config.hair:type==='ribbon'?config.accessories:config.clothing;
 if(section?.enabled===false)return null;
 return {category:type,preset:manual?.preset||section?.preset||type,...resolveParameters(manual?.preset||section?.preset||type,{...section,...manual})};
}
