const wave=(t,s=1)=>Math.sin(t*Math.PI*2*s);
const blink=t=>Math.exp(-Math.pow((t%3.1-2.7)/.06,2));
const smile=(amount=.4)=>({mouthSmileLeft:amount,mouthSmileRight:amount});
const eyes=(name,value)=>({[name+'Left']:value,[name+'Right']:value});
export const commonActions=[
 {id:'idle',name:'待机',duration:12,loop:true,body:()=>null,face:()=>null},
 {id:'energetic',name:'元气活力',duration:3.2,loop:true,
  body:t=>({arms:[[.22,1.79,.05],[-.22,1.79,.05]],poles:[[.45,1.48,.12],[-.45,1.48,.12]],hands:'fist',sway:.025*wave(t,1/3.2),lean:.045,headTilt:.045*wave(t,1/3.2),bounce:.012*(1-Math.cos(t*Math.PI*4/3.2)),knees:.025}),
  face:t=>({...smile(.72),...eyes('eyeWide',.24),...eyes('browOuterUp',.27),jawOpen:.25,mouthUpperUpLeft:.48,mouthUpperUpRight:.48,...eyes('eyeBlink',blink(t))})},
 {id:'shy',name:'腼腆害羞',duration:4.8,loop:true,
  body:t=>({arms:[[.12,1.14,.215],[-.10,1.125,.19]],poles:[[.19,1.015,.06],[-.18,1.005,.045]],hands:'point',sway:.006*wave(t,1/4.8),turn:.085,lean:.045,headNod:.22,headTilt:.14,shoulders:.012,toe:true,tap:.005*wave(t,2/4.8)}),
  face:t=>({...smile(.09),mouthPressLeft:.18,mouthPressRight:.22,browInnerUp:.13,browDownLeft:.07,browDownRight:.07,...eyes('eyeLookDown',.52),eyeLookInLeft:.09*(1+wave(t,1/4.8)),eyeLookOutRight:.09*(1+wave(t,1/4.8)),...eyes('eyeBlink',.16+.84*blink(t))})},
 {id:'scared',name:'担心害怕',duration:3.6,loop:true,
  body:t=>({arms:[[-.13,1.25,.20],[.13,1.21,.25]],poles:[[.26,1.03,.19],[-.26,1.04,.22]],hands:'soft',lean:-.065,headNod:.05,shoulders:.035,crouch:.055,sway:.0025*wave(t,30/3.6),knees:.09}),
  face:t=>({...eyes('eyeWide',.42),browInnerUp:.4,...eyes('browDown',.35),jawOpen:.14,mouthFunnel:.45,eyeLookInLeft:.20*Math.max(0,wave(t,8/3.6)),eyeLookOutRight:.20*Math.max(0,wave(t,8/3.6)),eyeLookOutLeft:.20*Math.max(0,-wave(t,8/3.6)),eyeLookInRight:.20*Math.max(0,-wave(t,8/3.6)),...eyes('eyeBlink',.4*blink(t))})},
 {id:'happy_jump',name:'开心跳跃',duration:4.6,loop:false,
  body:t=>{let jump=0,land=0;for(const start of [.55,1.65,2.75]){const p=(t-start)/.65;if(p>0&&p<1)jump=.16*Math.sin(p*Math.PI);land=Math.max(land,.035*Math.exp(-Math.pow((t-start-.69)/.13,2)))}const raised=t>3.35;return {arms:raised?[[.20,1.75,.05],[-.20,1.75,.05]]:[[.41,1.49,.10],[-.41,1.49,.10]],poles:[[.44,1.35,.12],[-.44,1.35,.12]],hands:raised?'victory':'open',jump,crouch:land,headTilt:.055*wave(t,.7),knees:land*2.2}},
  face:t=>({...smile(.8),...eyes('eyeSquint',.32),...eyes('eyeBlink',.35),...eyes('cheekSquint',.25),jawOpen:.42,mouthUpperUpLeft:.40,mouthUpperUpRight:.40})},
 {id:'hug',name:'拥抱',duration:4.8,loop:false,
  body:t=>{const close=Math.max(0,Math.min(1,(t-.9)/1.2));return {arms:[[.29-.20*close,1.26,.33+.09*close],[-.29+.20*close,1.26,.33+.09*close]],poles:[[.34,1.16,.21],[-.34,1.16,.21]],hands:'soft',lean:.075,headTilt:.13,headNod:.035}},
  face:()=>({...smile(.30),...eyes('eyeBlink',.82),...eyes('cheekSquint',.10),browInnerUp:.035})}
];
