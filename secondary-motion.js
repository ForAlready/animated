import * as T from 'three';

// Physics presets for secondary motion parameters.
// k = spring stiffness, d = damping, gain = input sensitivity, limit = max deflection (radians).
export const PHYSICS_PRESETS = {
  soft:   { k: 30, d: 8,  gain: 0.015,  limit: 0.06  },
  skirt:  { k: 45, d: 9,  gain: 0.010,  limit: 0.045 },
  normal: { k: 55, d: 10, gain: 0.006,  limit: 0.028 },
  hair:   { k: 65, d: 11, gain: 0.0025, limit: 0.012 },
  hard:   { k: 80, d: 12, gain: 0.001,  limit: 0.008 },
};

// Bounded angular springs preserve bone lengths and the authored rest volume.
// Drive = OrbitControls angular rate + body Chest/Head world angular rate (animation).
export class SecondaryMotion {
  constructor(root, controls) {
    this.root = root;
    this.controls = controls;
    this.enabled = true;
    this.strength = 1;
    this.items = [];
    this.rotation = new T.Quaternion();
    this.euler = new T.Euler();
    this.chest = null;
    this.head = null;
    this._chestQ = new T.Quaternion();
    this._headQ = new T.Quaternion();
    this._prevChestQ = new T.Quaternion();
    this._prevHeadQ = new T.Quaternion();
    this._deltaQ = new T.Quaternion();
    this.boneDrive = 1;

    // Per-bone override storage: { "BoneShortName": { preset?, k?, d?, gain?, limit? } }
    this._boneOverrides = {};

    root.traverse(b => {
      if (!b.isBone) return;
      const name = b.name.split('__').at(-1);
      if (b.name.startsWith('SK_Role1_Body__')) {
        if (name === 'Chest_M') this.chest = b;
        if (name === 'Head_M') this.head = b;
      }
      const hair = b.name.startsWith('SK_Role1_Hair01__') && /Hair.*_\d\d$/.test(name);
      const skirt = b.name.startsWith('SK_Role1_Suit13_Skirt__') && /Skirt_.*_Jnt[234]$/.test(name);
      if (!hair && !skirt) return;
      const depth = Number(name.match(/(\d+)$/)[1]);
      if (hair && depth < 3) return;

      const category = hair ? 'hair' : 'skirt';
      const preset = PHYSICS_PRESETS[category];
      this.items.push({
        bone: b,
        shortName: name,
        category,
        rest: b.quaternion.clone(),
        x: 0, y: 0, vx: 0, vy: 0,
        k: preset.k,
        d: preset.d,
        gain: preset.gain,
        limit: preset.limit,
      });
    });
    this.reset();
  }

  // Apply per-bone overrides from the stored configuration.
  _applyOverrides(item) {
    const override = this._boneOverrides[item.shortName];
    if (!override) return;

    // If preset is specified, start from that preset
    if (override.preset && PHYSICS_PRESETS[override.preset]) {
      const p = PHYSICS_PRESETS[override.preset];
      item.k = p.k;
      item.d = p.d;
      item.gain = p.gain;
      item.limit = p.limit;
    }
    // Then apply individual overrides
    if (override.k !== undefined) item.k = override.k;
    if (override.d !== undefined) item.d = override.d;
    if (override.gain !== undefined) item.gain = override.gain;
    if (override.limit !== undefined) item.limit = override.limit;
  }

  // Set global preset for a category ('hair', 'skirt') or 'all'.
  setPreset(presetName, category = 'all') {
    const preset = PHYSICS_PRESETS[presetName];
    if (!preset) {
      console.warn(`Unknown preset: ${presetName}. Available: ${Object.keys(PHYSICS_PRESETS).join(', ')}`);
      return;
    }
    for (const item of this.items) {
      if (category !== 'all' && item.category !== category) continue;
      item.k = preset.k;
      item.d = preset.d;
      item.gain = preset.gain;
      item.limit = preset.limit;
      this._applyOverrides(item);
    }
    this.reset();
  }

  // Set per-bone override configuration.
  // bones: { "BoneShortName": { preset?, k?, d?, gain?, limit? }, ... }
  setBoneOverrides(bones) {
    Object.assign(this._boneOverrides, bones);
    // Re-apply all items with their category defaults then overrides
    for (const item of this.items) {
      const preset = PHYSICS_PRESETS[item.category];
      item.k = preset.k;
      item.d = preset.d;
      item.gain = preset.gain;
      item.limit = preset.limit;
      this._applyOverrides(item);
    }
    this.reset();
  }

  // Clear all per-bone overrides and reset to category defaults.
  clearBoneOverrides() {
    this._boneOverrides = {};
    for (const item of this.items) {
      const preset = PHYSICS_PRESETS[item.category];
      item.k = preset.k;
      item.d = preset.d;
      item.gain = preset.gain;
      item.limit = preset.limit;
    }
    this.reset();
  }

  // Get current physics parameters for a bone by short name.
  getBoneParams(shortName) {
    const item = this.items.find(i => i.shortName === shortName);
    if (!item) return null;
    return { k: item.k, d: item.d, gain: item.gain, limit: item.limit, category: item.category };
  }

  // List all tracked bones with their current parameters.
  listBones() {
    return this.items.map(i => ({
      shortName: i.shortName,
      category: i.category,
      k: i.k,
      d: i.d,
      gain: i.gain,
      limit: i.limit,
    }));
  }

  sampleDrivers() {
    this.root.updateMatrixWorld(true);
    if (this.chest) this.chest.getWorldQuaternion(this._prevChestQ);
    if (this.head) this.head.getWorldQuaternion(this._prevHeadQ);
  }

  reset() {
    this.yaw = this.controls.getAzimuthalAngle();
    this.pitch = this.controls.getPolarAngle();
    this.sampleDrivers();
    for (const s of this.items) {
      s.x = s.y = s.vx = s.vy = 0;
      s.bone.quaternion.copy(s.rest);
    }
  }

  // World-quat delta → approximate yaw (Y) / pitch (X) rate in rad/s.
  driverRate(prev, curr, dt) {
    this._deltaQ.copy(prev).invert().multiply(curr);
    this.euler.setFromQuaternion(this._deltaQ, 'YXZ');
    prev.copy(curr);
    return {
      yaw: T.MathUtils.clamp(this.euler.y / dt, -5, 5),
      pitch: T.MathUtils.clamp(this.euler.x / dt, -3, 3),
    };
  }

  update(dt, motion = {}) {
    const yaw = this.controls.getAzimuthalAngle();
    const pitch = this.controls.getPolarAngle();
    let delta = yaw - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const dp = pitch - this.pitch;
    this.yaw = yaw;
    this.pitch = pitch;
    if (!this.enabled) return;
    dt = T.MathUtils.clamp(dt, 1 / 240, 0.05);

    let boneYaw = 0, bonePitch = 0;
    this.root.updateMatrixWorld(true);
    if (this.chest) {
      this.chest.getWorldQuaternion(this._chestQ);
      const r = this.driverRate(this._prevChestQ, this._chestQ, dt);
      boneYaw += r.yaw;
      bonePitch += r.pitch;
    }
    if (this.head) {
      this.head.getWorldQuaternion(this._headQ);
      const r = this.driverRate(this._prevHeadQ, this._headQ, dt);
      boneYaw += r.yaw * 0.45;
      bonePitch += r.pitch * 0.45;
    }

    const horizontal = T.MathUtils.clamp(
      delta / dt + (motion.horizontal || 0) + boneYaw * this.boneDrive, -5, 5
    ) * this.strength;
    const vertical = T.MathUtils.clamp(
      dp / dt + (motion.vertical || 0) * 1.5 + bonePitch * this.boneDrive, -3, 3
    ) * this.strength;

    const steps = Math.ceil(dt * 120);
    const h = dt / steps;
    for (const s of this.items) {
      const tx = T.MathUtils.clamp(-vertical * s.gain, -s.limit, s.limit);
      const ty = T.MathUtils.clamp(-horizontal * s.gain, -s.limit, s.limit);
      for (let n = 0; n < steps; n++) {
        s.vx += (s.k * (tx - s.x) - s.d * s.vx) * h;
        s.vy += (s.k * (ty - s.y) - s.d * s.vy) * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
        if (Math.abs(s.x) > s.limit) { s.x = Math.sign(s.x) * s.limit; s.vx = 0; }
        if (Math.abs(s.y) > s.limit) { s.y = Math.sign(s.y) * s.limit; s.vy = 0; }
      }
      this.euler.set(0, s.y, s.x);
      this.rotation.setFromEuler(this.euler);
      s.bone.quaternion.copy(s.rest).multiply(this.rotation);
    }
  }
}
