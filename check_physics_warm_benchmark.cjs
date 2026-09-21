const {run}=require('./physics-test-harness.cjs'),fs=require('fs');
run(async page=>{
 const report=await page.evaluate(()=>{
  const a=window.actions,p=window.physics;const runs=[];
  const frame=()=>{a.beforeUpdate();a.mixer.update(1/60);a.update(1/60);p.update(1/60,{playing:true,distance:2,actionId:a.id})};
  for(let repeat=0;repeat<3;repeat++)for(const enabled of repeat%2?[true,false]:[false,true]){
   p.enabled=enabled;p.reset();a.play('idle',true);for(let i=0;i<90;i++)frame();const times=[],cost=[];
   for(let i=0;i<90;i++){const start=performance.now();frame();times.push(performance.now()-start);cost.push(p.stats.milliseconds)}
   times.sort((a,b)=>a-b);cost.sort((a,b)=>a-b);runs.push({repeat,enabled,median:times[45],p95:times[85],physicsMedian:cost[45],physicsP95:cost[85]});
  }return {outfit:window.currentOutfit,warmup:90,samples:90,runs,renderer:window.viewer.renderer.capabilities.isWebGL2?'WebGL2':'WebGL',scope:'CPU update only; excludes GPU rasterization'};
 });fs.writeFileSync(__dirname+'/physics_warm_benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
