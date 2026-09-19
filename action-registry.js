export class ActionRegistry {
 constructor(){this.common=new Map();this.outfits=new Map()}
 validate(action){
  if(!action||typeof action.id!=='string'||!action.id||typeof action.name!=='string'||!action.name||!(action.duration>0)||!Number.isFinite(action.duration)||typeof action.loop!=='boolean'||typeof action.body!=='function'||typeof action.face!=='function')throw new TypeError('Action requires id, name, duration, loop, body and face');
  return Object.freeze({...action});
 }
 registerCommon(action){this.common.set(action.id,this.validate(action));}
 // Interface only: no outfit-specific actions are registered in this release.
 registerOutfit(outfitId,action){if(!outfitId)throw new TypeError('outfitId required');const valid=this.validate(action);if(!this.outfits.has(outfitId))this.outfits.set(outfitId,new Map());this.outfits.get(outfitId).set(action.id,valid);return ()=>{const entries=this.outfits.get(outfitId);if(entries?.get(action.id)===valid)entries.delete(action.id)}}
 resolve(id,outfitId){
  const specific=this.outfits.get(outfitId)?.get(id);if(specific)return {action:specific,layer:'outfit'};
  const common=this.common.get(id);if(common)return {action:common,layer:'common'};
  const idle=this.common.get('idle');if(!idle)throw new Error('Common idle must be registered');return {action:idle,layer:'common',fallback:true};
 }
}
