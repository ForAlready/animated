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
    k:     baseline.k     * multiplier.k,
    d:     baseline.d     * multiplier.d,
    gain:  baseline.gain  * multiplier.gain,
    limit: baseline.limit * multiplier.limit,
  };
}

function clampAllParams(params) {
  return {
    k:     clampParam('k',     params.k),
    d:     clampParam('d',     params.d),
    gain:  clampParam('gain',  params.gain),
    limit: clampParam('limit', params.limit),
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

    // Global UI multipliers: applied after preset, before bone overrides.
    // Each value defaults to 1.0, UI sliders range 0.5–2.0.
    this._uiMul = { k: 1, d: 1, gain: 1, limit: 1 };

    // Config bone overrides: from outfit's physics config (absolute values).
    // Applied after uiMul, before sidebar single-bone overrides.
    this._configBoneOverrides = {};

    // Per-bone override storage: { "BoneShortName": { k?, d?, gain?, limit? } }
    // Values are absolute (override after all multipliers). Sidebar can override config.bones.
    this._boneOverrides = {};

    // Whether current physics state came from outfit config.
    this._hasConfig = false;

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

  // Compute effective parameters for an item.
  // Overlay order: 1) baseline → 2) ×preset/channels → 3) ×uiMul → 4) config.bones → 5) sidebar bone override → 6) final clamp.
  _computeParams(item) {
    const baseline = PHYSICS_BASELINES[item.category];
    const multiplierKey = this._categoryMultiplier[item.category];
    const preset = multiplierKey ? PRESET_MULTIPLIERS[multiplierKey] : PRESET_MULTIPLIERS.normal;
    
    // Step 1-2: baseline × preset multiplier
    let params = applyMultiplier(baseline, preset);

    // Step 3: × uiMul (global UI multipliers)
    params.k     *= this._uiMul.k;
    params.d     *= this._uiMul.d;
    params.gain  *= this._uiMul.gain;
    params.limit *= this._uiMul.limit;

    // Step 4: config.bones override (absolute values from outfit config)
    const configOverride = this._configBoneOverrides[item.shortName];
    if (configOverride) {
      if (configOverride.k !== undefined) params.k = configOverride.k;
      if (configOverride.d !== undefined) params.d = configOverride.d;
      if (configOverride.gain !== undefined) params.gain = configOverride.gain;
      if (configOverride.limit !== undefined) params.limit = configOverride.limit;
    }

    // Step 5: sidebar bone override (can temporarily override config.bones)
    const override = this._boneOverrides[item.shortName];
    if (override) {
      if (override.k !== undefined) params.k = override.k;
      if (override.d !== undefined) params.d = override.d;
      if (override.gain !== undefined) params.gain = override.gain;
      if (override.limit !== undefined) params.limit = override.limit;
    }

    // Step 6: final clamp to safe ranges
    return clampAllParams(params);
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
  // - hair: hair×soft, skirt×normal
  // - skirt: skirt×soft, hair×normal
  // - default: reset all to baseline (both ×normal)
  // Note: setPreset does NOT reset uiMul — use resetUiMul() separately if needed.
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
      // hair channel = soft, skirt channel = normal
      this._categoryMultiplier.hair = 'soft';
      this._categoryMultiplier.skirt = null;
    } else if (presetName === 'skirt') {
      // skirt channel = soft, hair channel = normal
      this._categoryMultiplier.skirt = 'soft';
      this._categoryMultiplier.hair = null;
    } else {
      console.warn(`Unknown preset: ${presetName}. Available: default, soft, normal, hard, hair, skirt`);
      return;
    }

    this._refreshAllParams();
    this.reset();
  }

  // Get current uiMul values.
  getUiMul() {
    return { ...this._uiMul };
  }

  // Set uiMul values (partial update allowed). Triggers refresh.
  setUiMul(values) {
    if (values.k !== undefined) this._uiMul.k = values.k;
    if (values.d !== undefined) this._uiMul.d = values.d;
    if (values.gain !== undefined) this._uiMul.gain = values.gain;
    if (values.limit !== undefined) this._uiMul.limit = values.limit;
    this._refreshAllParams();
  }

  // Reset uiMul to defaults (all 1.0). Triggers refresh.
  resetUiMul() {
    this._uiMul = { k: 1, d: 1, gain: 1, limit: 1 };
    this._refreshAllParams();
  }

  // Public refresh: recompute all bone parameters from current settings.
  refresh() {
    this._refreshAllParams();
  }

  // Set per-bone override configuration.
  // bones: { "BoneShortName": { k?, d?, gain?, limit? }, ... }
  // k/d/gain/limit: absolute values (override after all multipliers)
  setBoneOverrides(bones) {
    Object.assign(this._boneOverrides, bones);
    this._refreshAllParams();
    this.reset();
  }

  // Set override for a single bone. Values are absolute (empty/undefined = inherit).
  // Example: setSingleBoneOverride('AfterHair_L_01_03', { k: 50, d: 8 })
  setSingleBoneOverride(shortName, values) {
    if (!values || Object.keys(values).length === 0) {
      delete this._boneOverrides[shortName];
    } else {
      this._boneOverrides[shortName] = { ...values };
    }
    this._refreshAllParams();
  }

  // Get override for a single bone (or null if none).
  getSingleBoneOverride(shortName) {
    return this._boneOverrides[shortName] ? { ...this._boneOverrides[shortName] } : null;
  }

  // Clear override for a single bone.
  clearSingleBoneOverride(shortName) {
    delete this._boneOverrides[shortName];
    this._refreshAllParams();
  }

  // Clear all per-bone overrides and refresh from category multipliers.
  clearBoneOverrides() {
    this._boneOverrides = {};
    this._refreshAllParams();
    this.reset();
  }

  // Get all bone overrides.
  getBoneOverrides() {
    const result = {};
    for (const [k, v] of Object.entries(this._boneOverrides)) {
      result[k] = { ...v };
    }
    return result;
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
      preset: this._categoryMultiplier[item.category] || 'normal',
      uiMul: { ...this._uiMul },
      override: this._boneOverrides[item.shortName] || null,
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
      preset: this._categoryMultiplier[i.category] || 'normal',
      hasOverride: !!this._boneOverrides[i.shortName],
    }));
  }

  // Get current preset per category.
  getPresets() {
    return {
      hair: this._categoryMultiplier.hair || 'normal',
      skirt: this._categoryMultiplier.skirt || 'normal',
    };
  }

  // Get current multiplier settings (legacy alias).
  getMultipliers() {
    return { ...this._categoryMultiplier };
  }

  // Whether physics state came from outfit config.
  hasConfig() {
    return this._hasConfig;
  }

  // Clear config state (called on outfit change before applyConfig).
  clearConfig() {
    this._hasConfig = false;
    this._configBoneOverrides = {};
    this._categoryMultiplier = { hair: null, skirt: null };
  }

  // Apply physics config from outfit entry. Safely ignores bad/missing fields.
  // Schema: { preset?, channels?: { hair?: { preset? }, skirt?: { preset? } }, bones?: { shortName: { k?, d?, gain?, limit? } } }
  // Layering: 1) baseline → 2) config.preset/channels → 3) uiMul → 4) config.bones → 5) sidebar → 6) clamp
  // hasConfig() returns true only if at least one valid setting was applied.
  applyConfig(physics) {
    this.clearConfig();
    
    if (!physics || typeof physics !== 'object') {
      this._refreshAllParams();
      this.reset();
      return;
    }

    const validPresets = ['soft', 'normal', 'hard', 'hair', 'skirt', 'default'];
    let appliedPreset = false;
    let appliedChannels = false;
    let appliedBones = false;

    // Handle root-level preset
    if (physics.preset && typeof physics.preset === 'string') {
      const preset = physics.preset.toLowerCase();
      if (validPresets.includes(preset)) {
        appliedPreset = true;
        if (preset === 'default') {
          this._categoryMultiplier.hair = 'normal';
          this._categoryMultiplier.skirt = 'normal';
        } else if (preset === 'hair') {
          this._categoryMultiplier.hair = 'soft';
          this._categoryMultiplier.skirt = 'normal';
        } else if (preset === 'skirt') {
          this._categoryMultiplier.skirt = 'soft';
          this._categoryMultiplier.hair = 'normal';
        } else if (PRESET_MULTIPLIERS[preset]) {
          this._categoryMultiplier.hair = preset;
          this._categoryMultiplier.skirt = preset;
        }
      }
    }

    // Handle channels (override root preset for specific channels)
    if (physics.channels && typeof physics.channels === 'object') {
      for (const channel of ['hair', 'skirt']) {
        const chConf = physics.channels[channel];
        if (chConf && typeof chConf === 'object' && chConf.preset) {
          const chPreset = String(chConf.preset).toLowerCase();
          if (PRESET_MULTIPLIERS[chPreset]) {
            this._categoryMultiplier[channel] = chPreset;
            appliedChannels = true;
          } else if (chPreset === 'default') {
            this._categoryMultiplier[channel] = 'normal';
            appliedChannels = true;
          }
        }
      }
    }

    // Handle bones (absolute overrides, k/d/gain/limit only)
    if (physics.bones && typeof physics.bones === 'object') {
      const allowedKeys = ['k', 'd', 'gain', 'limit'];
      for (const [boneName, boneConf] of Object.entries(physics.bones)) {
        if (!boneConf || typeof boneConf !== 'object') continue;
        const itemExists = this.items.some(i => i.shortName === boneName);
        if (!itemExists) continue;
        
        const override = {};
        for (const key of allowedKeys) {
          if (boneConf[key] !== undefined && typeof boneConf[key] === 'number' && isFinite(boneConf[key])) {
            override[key] = boneConf[key];
          }
        }
        if (Object.keys(override).length > 0) {
          this._configBoneOverrides[boneName] = override;
          appliedBones = true;
        }
      }
    }

    // Only mark hasConfig true if at least one valid setting was applied
    this._hasConfig = appliedPreset || appliedChannels || appliedBones;

    this._refreshAllParams();
    this.reset();
  }

  // Get config bone overrides (for debugging/display).
  getConfigBoneOverrides() {
    const result = {};
    for (const [k, v] of Object.entries(this._configBoneOverrides)) {
      result[k] = { ...v };
    }
    return result;
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
