const {chromium}=require('C:/Users/小可乐/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('child_process');const fs=require('fs');
const python='C:/Users/小可乐/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
(async()=>{
 const server=spawn(python,['-m','http.server','18764','--bind','127.0.0.1'],{cwd:__dirname,windowsHide:true,stdio:'ignore'});let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:18764/');await page.waitForFunction(()=>window.actions, null,{timeout:120000});await page.click('#play');
  const report=await page.evaluate(()=>{
   const assert=(v,m)=>{if(!v)throw new Error(m)},a=window.actions,r=window.actionRegistry;
   assert(r.outfits.size===0,'Production outfit actions must remain empty');
   assert(a.play('unknown_action',true)==='idle','Unknown ID fallback');
   let rejected=false;try{r.registerOutfit('test',{id:'bad',name:'bad',duration:1,loop:false,body:()=>({})})}catch{rejected=true}assert(rejected,'Body-only actions must be rejected');
   const common=r.resolve('energetic','Suit13').action;
   const undo=r.registerOutfit('test',{...common,name:'Test override'});assert(r.resolve('energetic','test').layer==='outfit','Override priority');assert(r.resolve('energetic','Suit13').layer==='common','Outfit isolation');undo();assert(r.resolve('energetic','test').layer==='common','Unregister fallback');r.outfits.delete('test');
   const undoIdle=r.registerOutfit(a.outfitId,{...common,id:'idle',name:'Test idle override'});
   a.play('idle',true);window.setAnimationTime(1.2);
   const overrideShoulder=a.master.Shoulder_L,overrideBase=a.base[a.bones.findIndex(s=>s.bone===overrideShoulder)].q;
   assert(a.layer==='outfit'&&overrideShoulder.quaternion.angleTo(overrideBase)>.1,'Outfit idle must animate');
   assert(a.faces.some(m=>m.morphTargetInfluences.some(v=>v>.1)),'Outfit idle must drive face');
   undoIdle();r.outfits.delete(a.outfitId);
   const states=[];
   for(const id of ['energetic','shy','scared','happy_jump','hug']){
    a.play(id,true);window.setAnimationTime(id==='happy_jump'?.85:1.2);
    assert(a.faces.some(m=>m.morphTargetInfluences.some(v=>v>.1)),'Missing face '+id);
    const shoulder=a.master.Shoulder_L,base=a.base[a.bones.findIndex(s=>s.bone===shoulder)].q;assert(['Shoulder_L','Elbow_L','Wrist_L'].some(name=>{const bone=a.master[name],q=a.base[a.bones.findIndex(s=>s.bone===bone)].q;return bone.quaternion.angleTo(q)>.1}),'Missing body '+id);
    for(const s of a.bones)assert(s.bone.quaternion.toArray().every(Number.isFinite)&&Math.abs(s.bone.quaternion.length()-1)<1e-4,'Nonfinite or non-unit rig');
    const duration=a.duration,loop=a.definition.loop;a.beforeUpdate();a.mixer.update(0);a.update(duration+.01);
    assert(a.id===(loop?id:'idle'),'Completion behavior '+id);states.push({id,duration,loop,completion:a.id});
   }
   a.play('idle',true);a.beforeUpdate();a.mixer.setTime(3.7);const expected=a.bones.map(s=>s.bone.quaternion.clone()),face=a.faces.map(m=>m.morphTargetInfluences.slice());a.update(0,{seek:true});
   assert(a.bones.every((s,i)=>s.bone.quaternion.toArray().every((v,j)=>v===expected[i].toArray()[j])),'Idle changed');assert(a.faces.every((m,i)=>m.morphTargetInfluences.every((v,j)=>v===face[i][j])),'Idle facial values changed');
   a.play('shy',true);window.setAnimationTime(1.2);const l=a.world(a.master.IndexFinger4_L),rr=a.world(a.master.IndexFinger4_R);
   return {states,priority:true,fallback:true,requiresFace:true,idleRuntimeUnchanged:true,indexTipDistance:l.distanceTo(rr),outfitImplementations:r.outfits.size};
  });
  report.outfits=[];
  for(const id of await page.evaluate(()=>window.wardrobe.outfits.map(e=>e.id))){
   await page.evaluate(id=>window.selectOutfit(id),id);
   const result=await page.evaluate(()=>{window.actions.play('energetic',true);window.setAnimationTime(1.2);return {id:window.currentOutfit,faceCount:window.actions.faces.length,layer:window.actions.layer,action:window.actions.id}});
   if(result.faceCount<1||result.layer!=='common'||result.action!=='energetic')throw new Error('Outfit binding failed '+id);report.outfits.push(result);console.log('Bound '+id);
  }
  report.errors=errors;if(errors.length)throw new Error(errors.join('\n'));fs.writeFileSync(__dirname+'/action_validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
