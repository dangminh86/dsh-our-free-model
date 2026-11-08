import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleAlert, Check, LoaderCircle, RotateCcw, Save, Settings2, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, Input } from './components/ui'
import { settingsDraft, settingsChanged, syncSettings, validateSettingsDraft } from './settings-data.mjs'
import { visibilityCopy } from './visibility-data.mjs'
import type { Host, Summary } from './types'
import './settings.css'
import { useT, useLocale } from './i18n'

type Draft = ReturnType<typeof settingsDraft>
type NumberField = 'defaultMaxTokens' | 'probeIntervalMinutes'

export function Settings({ summary, host, active }: { summary: Summary; host: Host; active: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'
  const visibility = visibilityCopy(locale)

  const connectionError = (reason: unknown) => reason instanceof Error
    ? reason.name === 'TimeoutError' ? t('settingsTimeoutErr')
      : reason instanceof TypeError && /fetch/i.test(reason.message) ? t('settingsConnectErr')
      : reason.message : t('settingsSaveErr')

  const [state, setState] = useState(() => ({ saved: summary.settings, draft: settingsDraft(summary.settings) }))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<NumberField, string>>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const mounted = useRef(true)
  const activeRef = useRef(active)
  const generation = useRef(0)
  activeRef.current = active

  useEffect(() => () => { mounted.current = false; generation.current++ }, [])
  useEffect(() => {
    if (!active) { generation.current++; setMessage(''); setError('') }
  }, [active])
  useEffect(() => {
    setState(previous => syncSettings(previous, summary.settings, savingRef.current))
  }, [summary.settings])

  const dirty = settingsChanged(state.draft, state.saved)
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setState(previous => ({ ...previous, draft: { ...previous.draft, [key]: value } }))
    setErrors(previous => ({ ...previous, [key]: undefined }))
    setMessage(''); setError('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (savingRef.current || !activeRef.current) return
    const validation = validateSettingsDraft(state.draft, isEn)
    setErrors(validation.errors); setMessage(''); setError('')
    if (!validation.patch) return
    const started = ++generation.current
    const feedbackCurrent = () => mounted.current && activeRef.current && started === generation.current
    savingRef.current = true
    setSaving(true)
    try {
      const saved = await host.saveSettings(validation.patch)
      if (!mounted.current) return
      setState({ saved, draft: settingsDraft(saved) })
      if (feedbackCurrent()) setMessage(t('settingsSaved'))
      try { await host.refresh() } catch {
        if (feedbackCurrent()) setMessage(t('settingsSavedRefreshFailed'))
      }
    } catch (reason) {
      if (feedbackCurrent()) setError(connectionError(reason))
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  const toggle = (name: 'enabled' | 'exposeRegionModels' | 'streamRecovery' | 'standaloneProbe' | 'hideFreeModels' | 'hideEacModels', label: string, help: string, disabled = false) =>
    <label className="settings-field" key={name}>
      <span><strong>{label}</strong><small>{help}</small></span>
      <input type="checkbox" role="switch" name={name} className="settings-toggle" disabled={disabled}
        checked={state.draft[name]} onChange={event => update(name, event.target.checked)} />
    </label>

  const numeric = (name: NumberField, label: string, help: string, min: number, max: number) =>
    <div className="settings-field settings-number-field">
      <label htmlFor={`setting-${name}`}><strong>{label}</strong><small>{help}</small></label>
      <div className="settings-number"><Input id={`setting-${name}`} name={name} type="number" min={min} max={max} step={1}
        value={state.draft[name]} onChange={event => update(name, event.target.value)}
        aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `setting-error-${name}` : undefined} />
        {errors[name] ? <p id={`setting-error-${name}`} className="settings-field-error" role="alert"><CircleAlert size={12} />{errors[name]}</p>
          : <span className="settings-hint">{min}–{max}</span>}
      </div>
    </div>

  if (!active) return null
  const statusClass = saving ? 'settings-status-saving' : dirty ? 'settings-status-dirty' : message ? 'settings-status-saved' : ''

  return <div className="settings-browser" data-testid="settings-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">MANAGEMENT / SETTINGS</div>
      <h1>{t('settingsTitle')}</h1><p>{t('settingsSubtitle')}</p></div>
      <Badge tone={summary.settings.enabled ? 'success' : 'warning'}>{summary.settings.enabled ? t('serviceEnabled') : t('servicePaused')}</Badge>
    </header>
    <form onSubmit={event => { void submit(event) }} noValidate>
      <fieldset disabled={saving} className="settings-fieldset">
        <Card className="settings-card"><div className="settings-card-heading"><Settings2 size={16} /><div><h2>{t('settingsInferenceSection')}</h2><p>{t('settingsInferenceSub')}</p></div></div>
          {toggle('enabled', t('settingsEnableInference'), t('settingsEnableInferenceHelp'))}
          <div className="settings-field">
            <span><strong>{t('settingsBindHost')}</strong><small>{t('settingsBindHostHelp')}</small></span>
            <div className="settings-number">
              <select
                id="setting-standaloneHost"
                name="standaloneHost"
                aria-label={t('settingsBindHost')}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-layer-2, #18222d)',
                  color: 'inherit',
                  fontSize: '13px',
                }}
                value={state.draft.standaloneHost ?? '127.0.0.1'}
                onChange={event => update('standaloneHost' as any, event.target.value as any)}
              >
                <option value="127.0.0.1">{t('settingsHostLocalOnly')}</option>
                <option value="0.0.0.0">{t('settingsHostAllInterfaces')}</option>
              </select>
            </div>
          </div>
          {toggle('exposeRegionModels', t('settingsExposeRegion'), t('settingsExposeRegionHelp'))}
          {toggle('hideFreeModels', visibility.hideFree, t('settingsHideFreeHelp'))}
          {toggle('hideEacModels', visibility.hideEac, t('settingsHideEacHelp'))}
          {toggle('streamRecovery', t('settingsStreamRecovery'), t('settingsStreamRecoveryHelp'))}
          {numeric('defaultMaxTokens', t('settingsMaxTokens'), t('settingsMaxTokensHelp'), 512, 131072)}
        </Card>
        <Card className="settings-card"><div className="settings-card-heading"><RefreshCw size={16} /><div><h2>{t('settingsRefreshSection')}</h2><p>{t('settingsRefreshSub')}</p></div></div>
          {numeric('probeIntervalMinutes', t('settingsProbeInterval'), t('settingsProbeIntervalHelp'), 1, 1440)}
          {toggle('standaloneProbe', t('settingsProbeDisabled'), t('settingsProbeDisabledHelp'), true)}
          <p className="settings-note" role="note"><CircleAlert size={15} /><span>{summary.automaticRefresh
            ? t('settingsRefreshActive')
            : t('settingsRefreshDisabled')}</span></p>
        </Card>
        <div className="settings-footer"><span role="status" aria-live="polite" className={statusClass}><span className="settings-status-dot" aria-hidden="true" />{saving ? t('settingsSavingWait') : dirty ? t('settingsUnsavedChanges') : message || t('settingsSynced')}</span>
          <div className="settings-actions"><Button variant="outline" disabled={!dirty || saving} onClick={() => {
            setState(previous => ({ ...previous, draft: settingsDraft(previous.saved) }))
            setErrors({}); setError(''); setMessage('')
          }}><RotateCcw size={15} />{t('settingsRevert')}</Button>
            <Button type="submit" disabled={!dirty || saving}>{saving ? <LoaderCircle size={15} className="spinning" /> : message && !dirty ? <Check size={15} /> : <Save size={15} />}{saving ? t('saving') : t('settingsSaveBtn')}</Button></div>
        </div>
      </fieldset>
      {error && <p className="settings-save-error" role="alert"><CircleAlert size={16} /><span>{error}</span></p>}
    </form>
    <p className="footnote">{t('settingsFootnote')}</p>
  </div>
}
