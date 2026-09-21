export function mountPhysicsPanel(get){
 const panel=document.createElement('details');panel.id='physics-panel';panel.innerHTML='<summary>物理调试</summary>';document.querySelector('aside').append(panel);const controls=[];
 const checkbox=(title,read,write)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.style.width='auto';input.onchange=()=>write(input.checked);label.append(input,document.createTextNode(' '+title));panel.append(label);controls.push(()=>input.checked=read())};
 checkbox('整体物理',()=>get().physics.enabled,v=>{const g=get();g.physics.enabled=v;g.secondary.enabled=v;g.physics.reset();document.getElementById('softness').textContent='整体物理：'+(v?'开':'关')});
 checkbox('身体回弹',()=>get().bounce.enabled!==false,v=>{get().bounce.enabled=v;get().bounce.reset()});
 checkbox('碰撞限制',()=>get().contacts.enabled,v=>{const g=get();g.contacts.enabled=v;g.physics.chainContacts.enabled=v;g.physics.cloth.enabled=v});
 checkbox('显示碰撞体',()=>get().colliders.debug.visible,v=>get().colliders.debug.visible=v);
 checkbox('显示骨骼',()=>get().physics.debug.bones.visible,v=>get().physics.debug.bones.visible=v);
 checkbox('显示弹簧链',()=>get().physics.debug.chains.visible,v=>get().physics.debug.chains.visible=v);
 const select=document.createElement('select');select.style.width='100%';panel.append(select);
 const entries=()=>[...get().bounce.items.map(s=>({name:s.name,p:s.parameters,type:'body'})),...get().secondary.items.map(s=>({name:s.bone.name,p:s.profile,type:'chain'}))];
 const targets=()=>entries().filter(e=>select.value==='body'?e.type==='body':select.value==='chains'?e.type==='chain':e.name===select.value);
 const sliders=[];
 for(const [key,title,min,max,step] of [['stiffness','刚度',1,400,1],['damping','阻尼',1,50,1],['mass','质量',.1,5,.1],['gravity','重力',0,1,.01],['drag','空气阻力',0,10,.1],['inertia','惯性',0,1,.01],['bounce','回弹',0,.8,.01],['frequency','频率',.2,8,.1],['maxAngle','最大转角（链）',0,.6,.01],['maxOffset','最大位移（身体）',0,.03,.001],['collisionRadius','链碰撞半径',.001,.1,.001]]){
  const label=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input');input.type='range';Object.assign(input,{min,max,step});input.dataset.physics=key;input.oninput=()=>{const v=Number(input.value);for(const e of targets())e.p[key]=v;text.textContent=title+' '+v};label.append(text,input);panel.append(label);sliders.push(()=>{const p=targets()[0]?.p;input.disabled=!p||(key==='maxAngle'&&select.value==='body')||(key==='maxOffset'&&select.value==='chains');if(p){input.value=p[key];text.textContent=title+' '+p[key]}});
 }
 const sync=()=>{for(const f of controls)f();for(const f of sliders)f()};select.onchange=sync;
 const rebuild=()=>{select.replaceChildren(new Option('身体辅助骨骼','body'),new Option('头发与衣物链','chains'));for(const e of entries())select.add(new Option(e.name,e.name));sync()};
 window.addEventListener('physics-ready',rebuild);panel.addEventListener('toggle',sync);rebuild();return panel;
}
