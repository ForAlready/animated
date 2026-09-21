import {SpringState} from './physics/spring.js';
import {resolveParameters,resolveBoneConfig} from './physics/config.js';
import {Vector3} from './vendor/three.module.js';
const assert=(x,m)=>{if(!x)throw Error(m)};
const p=resolveParameters('bodySoft'),responses=[];
for(const fps of [30,60,120]){const s=new SpringState(),a=new Vector3();let peak=0;for(let i=0;i<fps*4;i++){a.set(i<fps*.2?2:0,0,0);s.step(1/fps,a,p);peak=Math.max(peak,s.x.length())}assert(s.x.length()<1e-5,'Decay');responses.push({fps,peak,residual:s.x.length()});s.step(4,a,p);assert(s.x.length()===0,'Background reset')}
assert(Math.max(...responses.map(x=>x.peak))/Math.min(...responses.map(x=>x.peak))<1.1,'FPS sensitivity');
assert(resolveBoneConfig('Chest_M')===null,'Primary joint protected');
assert(resolveBoneConfig('Boom_L',{autoDetect:false,bones:{Boom_L:{preset:'bodySoft',mass:2}}}).mass===2,'Manual override');
assert(resolveParameters('bodySoft',{maxOffset:100}).maxOffset===.03,'Parameter clamp');
console.log(JSON.stringify({responses,primaryProtected:true,override:true,clamp:true}));
