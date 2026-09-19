export type CommonActionId = 'idle' | 'energetic' | 'shy' | 'scared' | 'happy_jump' | 'hug';
export type Point3 = [number, number, number];
/** Model-space meters, Y up, Z forward. Left/right are the character's sides. */
export interface BodyPose {
 arms: [Point3, Point3];
 poles: [Point3, Point3];
 hands: 'open' | 'soft' | 'fist' | 'point' | 'victory';
 lean?: number; turn?: number; headTilt?: number; headNod?: number;
 shoulders?: number; crouch?: number; knees?: number;
 jump?: number; bounce?: number; sway?: number; toe?: boolean; tap?: number;
}
/** Values are clamped to [0,1]. Keys refer to the original facial morph names. */
export type FacePose = Record<string, number>;
export interface CharacterAction {
 id: string;
 name: string;
 duration: number;
 loop: boolean;
 /** Both callbacks are required; they must be deterministic and must not mutate the rig. */
 body(timeSeconds: number): BodyPose | null;
 face(timeSeconds: number): FacePose | null;
}
export interface ActionResolution {
 action: Readonly<CharacterAction>;
 layer: 'common' | 'outfit';
 fallback?: boolean;
}
export interface ActionRegistryContract {
 registerCommon(action: CharacterAction): void;
 /** Same ID overrides the common definition only for this outfit. Returns unregister. */
 registerOutfit(outfitId: string, action: CharacterAction): () => void;
 resolve(actionId: string, outfitId: string): ActionResolution;
}
export interface CharacterActionPlayer {
 readonly id: string;
 readonly layer: 'common' | 'outfit';
 readonly time: number;
 readonly duration: number;
 play(id: string, immediate?: boolean): string;
 seek(timeSeconds: number): void;
 dispose(): void;
}
