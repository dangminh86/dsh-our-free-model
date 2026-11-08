/** @param {import('./types').ServiceSettings} settings */
export function settingsDraft(settings) {
  return {
    enabled: settings.enabled,
    exposeRegionModels: settings.exposeRegionModels,
    hideFreeModels: settings.hideFreeModels === true,
    hideEacModels: settings.hideEacModels === true,
    streamRecovery: settings.streamRecovery,
    standaloneProbe: settings.standaloneProbe,
    defaultMaxTokens: String(settings.defaultMaxTokens),
    probeIntervalMinutes: String(settings.probeIntervalMinutes),
    ...settings.standaloneHost !== undefined ? { standaloneHost: settings.standaloneHost } : {},
  }
}

/** @param {ReturnType<typeof settingsDraft>} draft
 * @param {import('./types').ServiceSettings} saved */
export function settingsChanged(draft, saved) {
  const baseline = settingsDraft(saved)
  return Object.keys(baseline).some(key => draft[key] !== baseline[key])
}

/** 轮询可以更新基线，但不能覆盖草稿或正在保存的输入。
 * @param {{ saved: import('./types').ServiceSettings, draft: ReturnType<typeof settingsDraft> }} state
 * @param {import('./types').ServiceSettings} saved
 * @param {boolean} saving */
export function syncSettings(state, saved, saving) {
  return { saved, draft: saving || settingsChanged(state.draft, state.saved) ? state.draft : settingsDraft(saved) }
}

/** Only form-owned settings are submitted; preserve per-model choices made elsewhere.
 * @param {ReturnType<typeof settingsDraft>} draft
 * @param {boolean} [isEn] */
export function validateSettingsDraft(draft, isEn = false) {
  /** @type {Partial<Record<'defaultMaxTokens' | 'probeIntervalMinutes', string>>} */
  const errors = {}
  for (const [key, labelZh, labelEn, min, max] of [
    ['defaultMaxTokens', '最大输出 Token', 'Max Output Tokens', 512, 131072],
    ['probeIntervalMinutes', '刷新间隔', 'Probe Interval', 1, 1440],
  ]) {
    const raw = draft[key].trim()
    const value = Number(raw)
    if (!raw || !Number.isInteger(value) || value < min || value > max) {
      errors[key] = isEn ? `${labelEn} must be an integer between ${min} and ${max}.` : `${labelZh}必须是 ${min}–${max} 的整数。`
    }
  }
  return {
    errors,
    patch: Object.keys(errors).length ? null : {
      enabled: draft.enabled, exposeRegionModels: draft.exposeRegionModels,
      hideFreeModels: draft.hideFreeModels, hideEacModels: draft.hideEacModels,
      streamRecovery: draft.streamRecovery, standaloneProbe: draft.standaloneProbe,
      defaultMaxTokens: Number(draft.defaultMaxTokens), probeIntervalMinutes: Number(draft.probeIntervalMinutes),
      ...draft.standaloneHost !== undefined ? { standaloneHost: draft.standaloneHost === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1' } : {},
    },
  }
}
