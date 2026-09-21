const {run}=require('./physics-test-harness.cjs'),fs=require('fs');
run(async page=>{
 await page.locator('#physics-panel summary').click();
 await page.getByLabel('显示碰撞体',{exact:true}).check();
 await page.getByLabel('显示骨骼',{exact:true}).check();
 await page.getByLabel('显示弹簧链',{exact:true}).check();
 const shown=await page.evaluate(()=>({colliders:physics.colliders.debug.visible,bones:physics.debug.bones.visible,chains:physics.debug.chains.visible}));
 await page.screenshot({path:__dirname+'/physics_debug_verified.png'});
 await page.getByLabel('整体物理',{exact:true}).uncheck();if(await page.evaluate(()=>physics.enabled))throw Error('Global switch');
 await page.getByLabel('整体物理',{exact:true}).check();
 const result=await page.evaluate(()=>{const a=actions,p=physics;a.play('shy',true);window.setAnimationTime(1.2);p.colliders.update();const c=p.chainContacts;
  const penetration=()=>{let sum=0;for(const s of c.items){if(!s.bone.name.includes('Hair'))continue;const child=s.bone.children.find(b=>b.isBone);const q=a.world(child);for(const col of p.colliders.items){if(!['Head','Chest','UpperArm_L','UpperArm_R'].includes(col.name))continue;const moved=q.clone();col.project(moved,s.profile?.collisionRadius||.008);sum+=moved.distanceTo(q)}}return sum};
  const before=penetration();c.update();const after=penetration();return {before,after,contacts:c.contacts};
 });if(result.after>result.before+.0001)throw Error('Hair penetration worsened');fs.writeFileSync(__dirname+'/physics_ui_contact_report.json',JSON.stringify({shown,hair:result},null,2));console.log(JSON.stringify({shown,hair:result}));
});
