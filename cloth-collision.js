import * as T from 'three';

// Default capsule collider configuration for Suit13 legs (targets: skirt vertices)
const DEFAULT_CAPSULE_CONFIG = [
 { boneStart: 'Hip_L', boneEnd: 'Knee_L', r0: 0.060, r1: 0.044, padding: 0.006, enabled: true },
 { boneStart: 'Hip_R', boneEnd: 'Knee_R', r0: 0.060, r1: 0.044, padding: 0.006, enabled: true }
];

// Default sphere collider configuration for chest/abdomen (targets: proximal arm vertices)
// Final physics spec: chest r=0.09, abdomen r=0.07, padding=0.006
const DEFAULT_SPHERE_CONFIG = [
 { bone: 'Chest_M', radius: 0.09, padding: 0.006, enabled: true },
 { bone: 'Spine_M', fallback: ['Waist_M', 'Stomach_M', 'Spine1_M'], radius: 0.07, padding: 0.006, enabled: true }
];

// Arm bone name patterns for proximal vertex detection
const ARM_BONE_PATTERNS = [
 /^Shoulder_[LR]$/, /^ShoulderPart[12]_[LR]$/,
 /^Elbow_[LR]$/, /^ElbowPart[12]_[LR]$/,
 /^Wrist_[LR]$/, /^WristEnd_[LR]$/,
 /^UpperArm_[LR]$/, /^ForeArm_[LR]$/
];

// Threshold for proximal vertex detection (sum of arm bone weights)
const PROXIMAL_WEIGHT_THRESHOLD = 0.15;

// Combined default config (backward compatible)
const DEFAULT_COLLIDER_CONFIG = DEFAULT_CAPSULE_CONFIG;

// Runtime collision projection with layered targets:
// - Skirt vertices ↔ Leg capsules
// - Proximal (arm-weighted) vertices ↔ Chest/abdomen spheres
export class ClothCollision {
 constructor(root, options = {}) {
  this.root = root;
  this.enabled = true;
  this.showColliders = options.showColliders ?? false;
  this.items = [];
  this.bones = {};
  this.stats = { vertices: 0, contacts: 0, maxCorrection: 0, skirtVerts: 0, proximalVerts: 0 };
  this.debugGroup = new T.Group();
  this.debugGroup.name = 'ColliderDebug';
  this.debugGroup.visible = this.showColliders;

  // Collect body bones and build arm bone index set
  const armBoneIndices = new Map(); // mesh skeleton → Set of arm bone indices
  root.traverse(o => {
   if (o.isBone && o.name.startsWith('SK_Role1_Body__'))
    this.bones[o.name.split('__').at(-1)] = o;
  });

  // Collect skirt meshes (kind: 'skirt' → leg capsules)
  root.traverse(o => {
   if (o.isSkinnedMesh && o.skeleton.bones.some(b => b.name.startsWith('SK_Role1_Suit13_Skirt__'))) {
    o.geometry = o.geometry.clone();
    const p = o.geometry.attributes.position;
    const rest = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
     rest[i * 3] = p.getX(i);
     rest[i * 3 + 1] = p.getY(i);
     rest[i * 3 + 2] = p.getZ(i);
    }
    this.items.push({ mesh: o, rest, offset: new Float32Array(p.count * 3), kind: 'skirt' });
    this.stats.vertices += p.count;
    this.stats.skirtVerts += p.count;
   }
  });

  // Collect proximal meshes (kind: 'proximal' → chest/abdomen spheres)
  // These are Body skeleton meshes with arm bone weights ≥ threshold
  root.traverse(o => {
   if (!o.isSkinnedMesh) return;
   if (!o.skeleton.bones.some(b => b.name.startsWith('SK_Role1_Body__'))) return;
   // Skip if already collected as skirt
   if (this.items.some(it => it.mesh === o)) return;
   
   // Build arm bone index set for this skeleton
   const armIndices = new Set();
   o.skeleton.bones.forEach((bone, idx) => {
    const shortName = bone.name.split('__').at(-1);
    if (ARM_BONE_PATTERNS.some(pat => pat.test(shortName))) {
     armIndices.add(idx);
    }
   });
   if (armIndices.size === 0) return;

   // Find vertices with significant arm bone weight
   const g = o.geometry;
   const skinIndex = g.attributes.skinIndex;
   const skinWeight = g.attributes.skinWeight;
   if (!skinIndex || !skinWeight) return;

   const proximalMask = new Uint8Array(g.attributes.position.count);
   let proximalCount = 0;
   
   for (let i = 0; i < g.attributes.position.count; i++) {
    let armWeight = 0;
    for (let j = 0; j < 4; j++) {
     const boneIdx = skinIndex.getComponent(i, j);
     const weight = skinWeight.getComponent(i, j);
     if (armIndices.has(boneIdx)) armWeight += weight;
    }
    if (armWeight >= PROXIMAL_WEIGHT_THRESHOLD) {
     proximalMask[i] = 1;
     proximalCount++;
    }
   }

   if (proximalCount === 0) return;

   // Clone geometry and create item for proximal vertices only
   o.geometry = o.geometry.clone();
   const p = o.geometry.attributes.position;
   const rest = new Float32Array(p.count * 3);
   for (let i = 0; i < p.count; i++) {
    rest[i * 3] = p.getX(i);
    rest[i * 3 + 1] = p.getY(i);
    rest[i * 3 + 2] = p.getZ(i);
   }
   
   this.items.push({
    mesh: o,
    rest,
    offset: new Float32Array(p.count * 3),
    kind: 'proximal',
    proximalMask // Only process vertices where mask[i] === 1
   });
   this.stats.vertices += proximalCount;
   this.stats.proximalVerts += proximalCount;
  });

  // Build capsules from config (use provided or default)
  const colliderConfig = options.colliders ?? DEFAULT_COLLIDER_CONFIG;
  this.colliderConfig = colliderConfig;
  this.capsules = [];
  
  for (const cfg of colliderConfig) {
   const boneA = this.bones[cfg.boneStart];
   const boneB = this.bones[cfg.boneEnd];
   if (!boneA || !boneB) continue;
   
   const capsule = {
    a: boneA,
    b: boneB,
    start: new T.Vector3(),
    end: new T.Vector3(),
    r0: cfg.r0,
    r1: cfg.r1,
    padding: cfg.padding ?? 0.006,
    enabled: cfg.enabled ?? true,
    config: cfg,
    debugMesh: null
   };
   
   capsule.debugMesh = this._createCapsuleDebugMesh(cfg.r0, cfg.r1);
   this.debugGroup.add(capsule.debugMesh);
   
   this.capsules.push(capsule);
  }

  // Build sphere colliders for chest/abdomen
  const sphereConfig = options.spheres ?? DEFAULT_SPHERE_CONFIG;
  this.sphereConfig = sphereConfig;
  this.spheres = [];
  
  for (const cfg of sphereConfig) {
   let bone = this.bones[cfg.bone];
   if (!bone && cfg.fallback) {
    for (const fb of cfg.fallback) {
     bone = this.bones[fb];
     if (bone) break;
    }
   }
   if (!bone) continue;
   
   const sphere = {
    bone,
    center: new T.Vector3(),
    radius: cfg.radius,
    padding: cfg.padding ?? 0.006,
    enabled: cfg.enabled ?? true,
    config: cfg,
    debugMesh: null
   };
   
   sphere.debugMesh = this._createSphereDebugMesh(cfg.radius);
   this.debugGroup.add(sphere.debugMesh);
   
   this.spheres.push(sphere);
  }

  root.add(this.debugGroup);

  // Temp vectors
  this.v = new T.Vector3();
  this.q = new T.Vector3();
  this.axis = new T.Vector3();
  this.delta = new T.Vector3();
  this.original = new T.Vector3();
  this.target = new T.Vector3();
  this.saved = new T.Vector3();
  this.blend = new T.Matrix4();
  this.boneMatrix = new T.Matrix4();
  this.skin = new T.Matrix4();
  this.inverse = new T.Matrix4();
  this.tick = 0;

  if (!this.items.some(it => it.kind === 'skirt') || this.capsules.length === 0)
   throw new Error('Missing skirt collision rig');
 }

 _createCapsuleDebugMesh(r0, r1) {
  const group = new T.Group();
  
  const material = new T.MeshBasicMaterial({
   color: 0x00ff88,
   transparent: true,
   opacity: 0.35,
   depthWrite: false,
   side: T.DoubleSide
  });

  const sphereGeoStart = new T.SphereGeometry(r0, 12, 8);
  const sphereStart = new T.Mesh(sphereGeoStart, material);
  sphereStart.name = 'start';
  group.add(sphereStart);

  const sphereGeoEnd = new T.SphereGeometry(r1, 12, 8);
  const sphereEnd = new T.Mesh(sphereGeoEnd, material);
  sphereEnd.name = 'end';
  group.add(sphereEnd);

  const cylinderGeo = new T.CylinderGeometry(r1, r0, 1, 12, 1, true);
  const cylinder = new T.Mesh(cylinderGeo, material);
  cylinder.name = 'cylinder';
  group.add(cylinder);

  const wireMaterial = new T.MeshBasicMaterial({
   color: 0x00ff88,
   wireframe: true,
   transparent: true,
   opacity: 0.6
  });

  const wireStart = new T.Mesh(sphereGeoStart.clone(), wireMaterial);
  wireStart.name = 'wireStart';
  group.add(wireStart);

  const wireEnd = new T.Mesh(sphereGeoEnd.clone(), wireMaterial);
  wireEnd.name = 'wireEnd';
  group.add(wireEnd);

  const wireCylinder = new T.Mesh(cylinderGeo.clone(), wireMaterial);
  wireCylinder.name = 'wireCylinder';
  group.add(wireCylinder);

  return group;
 }

 _createSphereDebugMesh(radius) {
  const group = new T.Group();
  
  const material = new T.MeshBasicMaterial({
   color: 0xff8800,
   transparent: true,
   opacity: 0.30,
   depthWrite: false,
   side: T.DoubleSide
  });

  const sphereGeo = new T.SphereGeometry(radius, 16, 12);
  const sphere = new T.Mesh(sphereGeo, material);
  sphere.name = 'sphere';
  group.add(sphere);

  const wireMaterial = new T.MeshBasicMaterial({
   color: 0xff8800,
   wireframe: true,
   transparent: true,
   opacity: 0.5
  });

  const wireSphere = new T.Mesh(sphereGeo.clone(), wireMaterial);
  wireSphere.name = 'wireSphere';
  group.add(wireSphere);

  return group;
 }

 _updateSphereDebugMesh(sphere) {
  const mesh = sphere.debugMesh;
  if (!mesh) return;

  const center = sphere.center;
  const sphereMesh = mesh.getObjectByName('sphere');
  const wireSphere = mesh.getObjectByName('wireSphere');
  
  if (sphereMesh) sphereMesh.position.copy(center);
  if (wireSphere) wireSphere.position.copy(center);

  mesh.visible = sphere.enabled;
 }

 _updateDebugMesh(capsule) {
  const mesh = capsule.debugMesh;
  if (!mesh) return;

  const start = capsule.start;
  const end = capsule.end;
  
  const sphereStart = mesh.getObjectByName('start');
  const sphereEnd = mesh.getObjectByName('end');
  const wireStart = mesh.getObjectByName('wireStart');
  const wireEnd = mesh.getObjectByName('wireEnd');
  
  if (sphereStart) sphereStart.position.copy(start);
  if (sphereEnd) sphereEnd.position.copy(end);
  if (wireStart) wireStart.position.copy(start);
  if (wireEnd) wireEnd.position.copy(end);

  const cylinder = mesh.getObjectByName('cylinder');
  const wireCylinder = mesh.getObjectByName('wireCylinder');
  
  if (cylinder) {
   const length = start.distanceTo(end);
   const midpoint = new T.Vector3().addVectors(start, end).multiplyScalar(0.5);
   
   cylinder.position.copy(midpoint);
   cylinder.scale.y = length;
   
   const direction = new T.Vector3().subVectors(end, start).normalize();
   const up = new T.Vector3(0, 1, 0);
   const quaternion = new T.Quaternion().setFromUnitVectors(up, direction);
   cylinder.quaternion.copy(quaternion);

   if (wireCylinder) {
    wireCylinder.position.copy(midpoint);
    wireCylinder.scale.y = length;
    wireCylinder.quaternion.copy(quaternion);
   }
  }

  mesh.visible = capsule.enabled;
 }

 setShowColliders(show) {
  this.showColliders = show;
  this.debugGroup.visible = this.enabled && show;
 }

 setColliderEnabled(index, enabled) {
  if (index >= 0 && index < this.capsules.length) {
   this.capsules[index].enabled = enabled;
   if (this.capsules[index].debugMesh) {
    this.capsules[index].debugMesh.visible = enabled && this.showColliders;
   }
  }
 }

 setSphereEnabled(index, enabled) {
  if (index >= 0 && index < this.spheres.length) {
   this.spheres[index].enabled = enabled;
   if (this.spheres[index].debugMesh) {
    this.spheres[index].debugMesh.visible = enabled && this.showColliders;
   }
  }
 }

 updateColliderConfig(index, config) {
  if (index >= 0 && index < this.capsules.length) {
   const capsule = this.capsules[index];
   if (config.r0 !== undefined) capsule.r0 = config.r0;
   if (config.r1 !== undefined) capsule.r1 = config.r1;
   if (config.padding !== undefined) capsule.padding = config.padding;
   if (config.enabled !== undefined) {
    capsule.enabled = config.enabled;
    if (capsule.debugMesh) {
     capsule.debugMesh.visible = config.enabled && this.showColliders;
    }
   }
  }
 }

 updateSphereConfig(index, config) {
  if (index >= 0 && index < this.spheres.length) {
   const sphere = this.spheres[index];
   if (config.radius !== undefined) sphere.radius = config.radius;
   if (config.padding !== undefined) sphere.padding = config.padding;
   if (config.enabled !== undefined) {
    sphere.enabled = config.enabled;
    if (sphere.debugMesh) {
     sphere.debugMesh.visible = config.enabled && this.showColliders;
    }
   }
  }
 }

 getColliderConfig() {
  return this.capsules.map((c, i) => ({
   index: i,
   boneStart: c.config.boneStart,
   boneEnd: c.config.boneEnd,
   r0: c.r0,
   r1: c.r1,
   padding: c.padding,
   enabled: c.enabled
  }));
 }

 getSphereConfig() {
  return this.spheres.map((s, i) => ({
   index: i,
   bone: s.config.bone,
   radius: s.radius,
   padding: s.padding,
   enabled: s.enabled
  }));
 }

 reset() {
  for (const item of this.items) {
   item.offset.fill(0);
   const p = item.mesh.geometry.attributes.position;
   for (let i = 0; i < p.count; i++)
    p.setXYZ(i, item.rest[i * 3], item.rest[i * 3 + 1], item.rest[i * 3 + 2]);
   item.mesh.geometry.attributes.position.needsUpdate = true;
   item.mesh.geometry.computeVertexNormals();
  }
 }

 // Project against capsules only (for skirt vertices)
 _projectCapsules(p) {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
   for (const c of this.capsules) {
    if (!c.enabled) continue;
    
    this.axis.subVectors(c.end, c.start);
    const t = T.MathUtils.clamp(
     this.q.subVectors(p, c.start).dot(this.axis) / this.axis.lengthSq(),
     0, 1
    );
    this.q.copy(c.start).addScaledVector(this.axis, t);
    this.delta.subVectors(p, this.q);
    const distance = this.delta.length();
    const radius = T.MathUtils.lerp(c.r0, c.r1, t) + c.padding;
    
    if (distance < radius) {
     if (distance < 1e-7) this.delta.set(0, 0, 1);
     else this.delta.multiplyScalar(1 / distance);
     const projected = radius + 0.002 * Math.exp((distance - radius) / 0.004);
     p.copy(this.q).addScaledVector(this.delta, projected);
     hit = true;
    }
   }
  }
  return hit;
 }

 // Project against spheres only (for proximal arm vertices)
 _projectSpheres(p) {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
   for (const s of this.spheres) {
    if (!s.enabled) continue;
    
    this.delta.subVectors(p, s.center);
    const distance = this.delta.length();
    const radius = s.radius + s.padding;
    
    if (distance < radius) {
     if (distance < 1e-7) this.delta.set(0, 0, 1);
     else this.delta.multiplyScalar(1 / distance);
     const projected = radius + 0.002 * Math.exp((distance - radius) / 0.004);
     p.copy(s.center).addScaledVector(this.delta, projected);
     hit = true;
    }
   }
  }
  return hit;
 }

 // Clamp offset's radial component for spheres to prevent snap-back
 _clampRadialVelocity(target, saved) {
  for (const s of this.spheres) {
   if (!s.enabled) continue;
   this.delta.subVectors(target, s.center);
   const dist = this.delta.length();
   if (dist < s.radius + s.padding + 0.01) {
    this.delta.normalize();
    const radial = saved.dot(this.delta);
    if (radial < 0) saved.addScaledVector(this.delta, -radial);
   }
  }
 }

 update(dt = 1 / 60) {
  this.debugGroup.visible = this.enabled && this.showColliders;
  
  if (!this.enabled) return;
  
  this.root.updateMatrixWorld(true);
  
  // Update collider positions from bones
  for (const c of this.capsules) {
   c.a.getWorldPosition(c.start);
   c.b.getWorldPosition(c.end);
  }
  for (const s of this.spheres) {
   s.bone.getWorldPosition(s.center);
  }

  // Update debug visualization if visible
  if (this.showColliders) {
   for (const c of this.capsules) this._updateDebugMesh(c);
   for (const s of this.spheres) this._updateSphereDebugMesh(s);
  }

  this.stats.contacts = 0;
  this.stats.maxCorrection = 0;
  const decay = Math.exp(-Math.min(dt, 0.05) * 18);

  for (const item of this.items) {
   const m = item.mesh;
   const g = m.geometry;
   const p = g.attributes.position;
   const indices = g.attributes.skinIndex;
   const weights = g.attributes.skinWeight;
   m.skeleton.update();

   const isSkirt = item.kind === 'skirt';
   const isProximal = item.kind === 'proximal';
   const proximalMask = item.proximalMask;

   for (let i = 0; i < p.count; i++) {
    // For proximal items, skip vertices not in the mask
    if (isProximal && (!proximalMask || !proximalMask[i])) continue;

    this.blend.elements.fill(0);
    for (let j = 0; j < 4; j++) {
     const w = weights.getComponent(i, j);
     if (!w) continue;
     this.boneMatrix.fromArray(m.skeleton.boneMatrices, indices.getComponent(i, j) * 16);
     for (let k = 0; k < 16; k++)
      this.blend.elements[k] += this.boneMatrix.elements[k] * w;
    }
    this.skin.copy(m.matrixWorld).multiply(m.bindMatrixInverse).multiply(this.blend).multiply(m.bindMatrix);
    this.original.fromArray(item.rest, i * 3).applyMatrix4(this.skin);
    this.target.copy(this.original);
    
    this.saved.fromArray(item.offset, i * 3).multiplyScalar(decay);
    this.target.add(this.saved);

    // Layered projection: skirt→capsules, proximal→spheres
    let hit = false;
    if (isSkirt) {
     hit = this._projectCapsules(this.target);
    } else if (isProximal) {
     hit = this._projectSpheres(this.target);
    }
    if (hit) this.stats.contacts++;

    this.saved.subVectors(this.target, this.original);
    
    // Clamp radial velocity for proximal vertices near spheres
    if (isProximal) {
     this._clampRadialVelocity(this.target, this.saved);
    }

    this.saved.toArray(item.offset, i * 3);
    this.stats.maxCorrection = Math.max(this.stats.maxCorrection, this.saved.length());
    this.inverse.copy(this.skin).invert();
    this.v.copy(this.target).applyMatrix4(this.inverse);
    p.setXYZ(i, this.v.x, this.v.y, this.v.z);
   }
   p.needsUpdate = true;
   if (this.tick % 3 === 0) g.computeVertexNormals();
   m.frustumCulled = false;
  }
  this.tick++;
 }

 dispose() {
  for (const c of this.capsules) {
   if (c.debugMesh) {
    c.debugMesh.traverse(obj => {
     if (obj.geometry) obj.geometry.dispose();
     if (obj.material) obj.material.dispose();
    });
   }
  }
  for (const s of this.spheres) {
   if (s.debugMesh) {
    s.debugMesh.traverse(obj => {
     if (obj.geometry) obj.geometry.dispose();
     if (obj.material) obj.material.dispose();
    });
   }
  }
  if (this.debugGroup.parent) {
   this.debugGroup.parent.remove(this.debugGroup);
  }
 }
}
