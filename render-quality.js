import * as T from 'three';

export function configureTextures(root,renderer){
 const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
 const seen=new Set();
 root.traverse(o=>{
  for(const m of (Array.isArray(o.material)?o.material:[o.material])){
   if(!m)continue;
   // Keep the source brow color; reduce exaggerated relief around the eyelids.
   if(m.name==='MI_Role1_Face' && m.normalMap)m.normalScale.set(.4,.4);
   for(const value of Object.values(m)){
    if(!value?.isTexture||seen.has(value))continue;
    seen.add(value);value.anisotropy=anisotropy;
    value.minFilter=T.LinearMipmapLinearFilter;value.magFilter=T.LinearFilter;
    value.generateMipmaps=true;value.needsUpdate=true;
   }
  }
 });
 return {anisotropy,textures:seen.size,pixelRatio:renderer.getPixelRatio()};
}
