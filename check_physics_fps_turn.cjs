const {run}=require('./physics-test-harness.cjs'),fs=require('fs');
run(async page=>{
 const report=await page.evaluate(()=>{
  const a=window.actions,p=window.physics,root=a.root,results=[];
  for(const fps of [30,60,120]){
   root.rotation.y=0;a.play('idle',true);a.beforeUpdate();a.mixer.setTime(0);a.update(0,{seek:true});p.reset();p.enabled=true;let peak=0,idlePeak=0;const samples=[],chainSamples=[];
   for(let i=0;i<fps*4;i++){
    const t=i/fps;a.beforeUpdate();a.mixer.setTime(t);a.update(0,{seek:true});
    const u=Math.max(0,Math.min(1,(t-1)/.4));root.rotation.y=.7*u*u*(3-2*u);
    p.update(1/fps,{playing:true,distance:2,actionId:'idle'});
    const x=p.bounce.items.find(s=>s.name==='Boom_L').x.length();peak=Math.max(peak,x);if(t<1)idlePeak=Math.max(idlePeak,x);
    if(i%(fps/30)===0){samples.push(x);chainSamples.push(p.secondary.items.flatMap(s=>[s.x,s.y]));}
    for(const s of p.bounce.items)if(!Number.isFinite(s.x.length())||s.x.length()>s.parameters.maxOffset+1e-6)throw Error('Body unstable');
   }
   results.push({fps,peak,idlePeak,samples,chainSamples});
  }
  root.rotation.y=0;p.reset();
  const reference=results[1].samples.slice(),chainReference=results[1].chainSamples.slice();for(const r of results){r.maxSampleDifference=Math.max(...r.samples.map((x,i)=>Math.abs(x-reference[i])));r.maxChainDifference=Math.max(...r.chainSamples.flatMap((v,i)=>v.map((x,j)=>Math.abs(x-chainReference[i][j]))));delete r.samples;delete r.chainSamples;}
  return {results,peakRatio:Math.max(...results.map(r=>r.peak))/Math.min(...results.map(r=>r.peak))};
 });
 fs.writeFileSync(__dirname+'/physics_fps_turn_report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});

