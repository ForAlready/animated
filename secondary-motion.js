import * as T from 'three';

// Category baselines: original hardcoded values as the reference point.
// k = spring stiffness, d = damping, gain = input sensitivity, limit = max deflection (radians).
export const PHYSICS_BASELINES = {
  hair:  { k: 65, d: 11, gain: 0.0025, limit: 0.012 },
  skirt: { k: 45, d: 9,  gain: 0.010,  limit: 0.045 },
};

// Preset multipliers: applied to each bone's category baseline.
// result = baseline(category) × multiplier, then clamped to safe ranges.
export const PRESET_MULTIPLIERS = {
  soft:   { k: 0.70, d: 0.90, gain: 1.40, limit: 1.40 },
  normal: { k: 1.00, d: 1.00, gain: 1.00, limit: 1.00 },
  hard:   { k: 1.25, d: 1.10, gain: 0.60, limit: 0.65 },
};

// Safe parameter ranges to prevent physics explosion.
const PARAM_CLAMP = {
  k:     { min: 10,    max: 150   },
  d:     { min: 3,     max: 25    },
  gain:  { min: 0.001, max: 0.025 },
  limit: { min: 0.005, max: 0.10  },
};

function clampParam(key, value) {
  const c = PARAM_CLAMP[key];
  return Math.max(c.min, Math.min(c.max, value));
}

function applyMultiplier(baseline, multiplier) {
  return {
    k:     clampParam('k',     baseline.k     * multiplier.k),
    d:     clampParam('d',     baseline.d     * multiplier.d),
    gain:  clampParam('gain',  baseline.gain  * multiplier.gain),
    limit: clampParam('limit', baseline.limit * multiplier.limit),
  };
}

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

    // Current multiplier preset per category (null = baseline ×1).
    this._categoryMultiplier = { hair: null, skirt: null };

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
      const baseline = PHYSICS_BASELINES[category];
      this.items.push({
        bone: b,
        shortName: name,
        category,
        rest: b.quaternion.clone(),
        x: 0, y: 0, vx: 0, vy: 0,
        k: baseline.k,
        d: baseline.d,
        gain: baseline.gain,
        limit: baseline.limit,
      });
    });
    this.reset();
  }

  // Compute effective parameters for an item based on category baseline, multiplier, and overrides.
  _computeParams(item) {
    const baseline = PHYSICS_BASELINES[item.category];
    const multiplierKey = this._categoryMultiplier[item.category];
    const multiplier = multiplierKey ? PRESET_MULTIPLIERS[multiplierKey] : PRESET_MULTIPLIERS.normal;
    
    // Start with baseline × multiplier
    let params = applyMultiplier(baseline, multiplier);

    // Apply per-bone overrides
    const override = this._boneOverrides[item.shortName];
    if (override) {
      // If preset override specified, use that multiplier instead
      if (override.preset && PRESET_MULTIPLIERS[override.preset]) {
        params = applyMultiplier(baseline, PRESET_MULTIPLIERS[override.preset]);
      }
      // Then apply individual parameter overrides (absolute values)
      if (override.k !== undefined) params.k = clampParam('k', override.k);
      if (override.d !== undefined) params.d = clampParam('d', override.d);
      if (override.gain !== undefined) params.gain = clampParam('gain', override.gain);
      if (override.limit !== undefined) params.limit = clampParam('limit', override.limit);
    }

    return params;
  }

  // Refresh all items with current multipliers and overrides.
  _refreshAllParams() {
    for (const item of this.items) {
      const p = this._computeParams(item);
      item.k = p.k;
      item.d = p.d;
      item.gain = p.gain;
      item.limit = p.limit;
    }
  }

  // Set preset for a category ('hair', 'skirt') or 'all'.
  // presetName: 'soft' | 'normal' | 'hard' | 'hair' | 'skirt' | 'default'
  // - soft/normal/hard: apply multiplier to specified category(ies)
  // - hair/skirt: reset that category to baseline (multiplier = normal)
  // - default: reset all to baseline
  setPreset(presetName, category = 'all') {
    if (presetName === 'default') {
      this._categoryMultiplier.hair = null;
      this._categoryMultiplier.skirt = null;
    } else if (PRESET_MULTIPLIERS[presetName]) {
      // soft/normal/hard: set multiplier for specified categories
      if (category === 'all' || category === 'hair') {
        this._categoryMultiplier.hair = presetName;
      }
      if (category === 'all' || category === 'skirt') {
        this._categoryMultiplier.skirt = presetName;
      }
    } else if (presetName === 'hair') {
      // Reset hair category to baseline only
      this._categoryMultiplier.hair = null;
    } else if (presetName === 'skirt') {
      // Reset skirt category to baseline only
      this._categoryMultiplier.skirt = null;
    } else {
      console.warn(`Unknown preset: ${presetName}. Available: default, soft, normal, hard, hair, skirt`);
      return;
    }

    this._refreshAllParams();
    this.reset();
  }

  // Set per-bone override configuration.
  // bones: { "BoneShortName": { preset?, k?, d?, gain?, limit? }, ... }
  // preset: 'soft' | 'normal' | 'hard' (applies multiplier to bone's category baseline)
  // k/d/gain/limit: absolute values (override after multiplier)
  setBoneOverrides(bones) {
    Object.assign(this._boneOverrides, bones);
    this._refreshAllParams();
    this.reset();
  }

  // Clear all per-bone overrides and refresh from category multipliers.
  clearBoneOverrides() {
    this._boneOverrides = {};
    this._refreshAllParams();
    this.reset();
  }

  // Get current physics parameters for a bone by short name.
  getBoneParams(shortName) {
    const item = this.items.find(i => i.shortName === shortName);
    if (!item) return null;
    return {
      shortName: item.shortName,
      category: item.category,
      k: item.k,
      d: item.d,
      gain: item.gain,
      limit: item.limit,
      baseline: PHYSICS_BASELINES[item.category],
      multiplier: this._categoryMultiplier[item.category] || 'normal',
    };
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
      multiplier: this._categoryMultiplier[i.category] || 'normal',
    }));
  }

  // Get current multiplier settings.
  getMultipliers() {
    return { ...this._categoryMultiplier };
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
