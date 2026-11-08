import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import { Boxes, Check, CircleAlert, CircleCheck, Copy, Eye, EyeOff, LoaderCircle, Play, RefreshCw, Search, SlidersHorizontal, Square, X } from 'lucide-react'
import { providers } from 'ofm-provider-list'
import { Badge, Button, Input } from './components/ui'
import { filterModels } from './models-data.mjs'
import { visibilityCopy } from './visibility-data.mjs'
import type { Host, Model, ModelTestResult, ServiceSettings, Summary } from './types'
import './models.css'
import { useT, useLocale } from './i18n'

export function Models({ summary, host, active }: { summary: Summary; host: Host; active: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'
  const visibility = visibilityCopy(locale)

  const availabilityNames: Record<string, string> = {
    available: t('avail_available'),
    listed: t('avail_listed'),
    unknown: t('avail_unknown'),
    unavailable: t('avail_unavailable'),
    throttled: t('avail_throttled'),
    'region-blocked': t('avail_region_blocked'),
  }

  const sourceNames: Record<string, string> = {
    anonymous: t('src_anonymous'),
    kilo: t('src_kilo'),
    eac: t('src_eac'),
  }

  const channelName = (id: string) => sourceNames[id]
    ?? providers.find(provider => provider.id === id)?.name ?? id
  const number = (value: number) => new Intl.NumberFormat(isEn ? 'en-US' : 'zh-CN').format(value)
  const capacity = (value?: number) => value && Number.isFinite(value) && value > 0
    ? value >= 1000 ? `${Number((value / 1000).toFixed(1))}K` : number(value) : (isEn ? 'Unknown' : '未知')

  const initialFilters = { search: '', channel: 'all', capability: 'all', availability: 'all', access: 'all' }
  type Operation = 'refresh' | 'probe' | 'test'
  type TestState = { model: Model; state: 'pending' | 'success' | 'error' | 'cancelled'; result?: ModelTestResult; error?: string }

  const [filters, setFilters] = useState(initialFilters)
  const [operation, setOperation] = useState<Operation>()
  const [test, setTest] = useState<TestState>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string>()
  const [focusedId, setFocusedId] = useState<string>()
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const visibilityPending = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pending = useRef<AbortController | undefined>(undefined)
  const activeRef = useRef(active)
  activeRef.current = active
  const models = useMemo<Model[]>(() => filterModels(summary.catalog, filters), [summary.catalog, filters])
  const channels = useMemo(() => [...new Set(['anonymous', 'kilo', 'eac', ...summary.catalog.map(model => model.channel), filters.channel])]
    .filter(id => id !== 'all'), [summary.catalog, filters.channel])
  const focusedIndex = focusedId ? models.findIndex(model => model.id === focusedId) : -1
  const rangeExtractor = useCallback((range: Range) => {
    const visible = defaultRangeExtractor(range)
    return focusedIndex >= 0 ? [...new Set([...visible, focusedIndex])].sort((a, b) => a - b) : visible
  }, [focusedIndex])
  const virtual = useVirtualizer({
    count: models.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => 112, overscan: 5, enabled: active,
    getItemKey: index => models[index].id, rangeExtractor,
  })
  const changeFilters = (patch: Partial<typeof initialFilters>) => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setFilters(previous => ({ ...previous, ...patch }))
    setFocusedId(undefined)
  }
  useEffect(() => {
    if (!active) {
      pending.current?.abort()
      pending.current = undefined
      setOperation(undefined)
      setTest(previous => previous?.state === 'pending' ? { ...previous, state: 'cancelled' } : previous)
    }
    return () => { pending.current?.abort(); pending.current = undefined }
  }, [active])
  useEffect(() => {
    if (active && scrollRef.current) {
      const max = Math.max(0, virtual.getTotalSize() - scrollRef.current.clientHeight)
      if (scrollRef.current.scrollTop > max) scrollRef.current.scrollTop = max
    }
  }, [models.length, active, virtual])

  const run = async (kind: Operation, model?: Model) => {
    if (pending.current || !activeRef.current) return
    const controller = new AbortController()
    pending.current = controller
    setOperation(kind); setError(''); setMessage('')
    if (model) setTest({ model, state: 'pending' })
    const isCurrent = () => pending.current === controller && !controller.signal.aborted && activeRef.current
    try {
      if (kind === 'test' && model) {
        const result = await host.testModel(model.id, controller.signal)
        if (!isCurrent()) return
        setTest({ model, state: 'success', result })
        try {
          await host.refresh()
        } catch (reason) {
          if (!isCurrent()) return
          const detail = reason instanceof Error ? reason.name === 'TimeoutError' ? '请求超时，请重试。' : reason.message : '请求失败，请重试。'
          setError(`模型测试已成功，但刷新摘要失败：${detail}`)
        }
      } else {
        await host.refreshModels(kind === 'probe', controller.signal)
        if (!isCurrent()) return
        setMessage(kind === 'probe' ? '可用性探测已完成' : '模型清单已更新')
      }
    } catch (reason) {
      if (!isCurrent()) return
      const detail = reason instanceof Error ? reason.name === 'TimeoutError' ? '请求超时，请重试。' : reason.message : '操作失败，请重试。'
      if (kind === 'test' && model) setTest({ model, state: 'error', error: detail })
      else setError(detail)
    } finally {
      if (isCurrent()) { pending.current = undefined; setOperation(undefined) }
    }
  }

  const cancel = () => {
    pending.current?.abort()
    pending.current = undefined
    setOperation(undefined)
    setTest(previous => previous ? { ...previous, state: 'cancelled' } : previous)
  }

  const copyModelId = (model: Model) => {
    void host.copy(model.id).then(() => {
      if (activeRef.current) {
        setCopied(model.id)
        setTimeout(() => { if (activeRef.current) setCopied(undefined) }, 1800)
      }
    }).catch(host.error)
  }

  const saveVisibility = async (patch: Partial<ServiceSettings>) => {
    if (visibilityPending.current || !activeRef.current) return
    visibilityPending.current = true
    setVisibilitySaving(true); setError(''); setMessage('')
    try {
      await host.saveSettings(patch)
      if (activeRef.current) setMessage(visibility.saved)
      try { await host.refresh() } catch (reason) { if (activeRef.current) host.error(reason as Error) }
    } catch (reason) {
      if (activeRef.current) setError(reason instanceof Error ? reason.message : t('saveFailed'))
    } finally {
      visibilityPending.current = false
      setVisibilitySaving(false)
    }
  }

  if (!active) return null
  const filtered = Object.entries(filters).some(([key, value]) => value !== initialFilters[key as keyof typeof initialFilters])
  const routable = summary.catalog.filter(model => model.routable).length

  return <div className="model-browser" data-testid="models-ready">
    <header className="dashboard-heading">
      <div><div className="heading-eyebrow">WORKSPACE / MODELS</div><h1>{t('navModels')}</h1>
        <p>{number(summary.catalog.length)} {t('modelsCount')} · {number(routable)} {t('modelsRoutable')}</p></div>
      <div className="actions">
        <Button variant="outline" disabled={!!operation} onClick={() => { void run('refresh') }}>
          <RefreshCw size={15} className={operation === 'refresh' ? 'spinning' : ''} />{operation === 'refresh' ? t('refreshingCatalog') : t('refreshCatalog')}
        </Button>
        <Button disabled={!!operation || !summary.settings.enabled} title={t('probeHint')}
          onClick={() => { void run('probe') }}>
          {operation === 'probe' ? <LoaderCircle size={15} className="spinning" /> : <CircleCheck size={15} />}
          {operation === 'probe' ? t('probingAvailability') : t('probeAvailability')}
        </Button>
      </div>
    </header>
    <div className="model-summary">
      <span><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? t('serviceEnabled') : t('servicePaused')}</span>
      <span>{t('catalogSynced')}{summary.catalogSyncedAt ? new Date(summary.catalogSyncedAt).toLocaleString(isEn ? 'en-US' : 'zh-CN', { hour12: false }) : t('notYetRefreshed')}</span>
      <span>{t('probeCostHint')}</span>
    </div>
    {error && <div className="channel-error" role="alert"><CircleAlert size={16} /><span>{error}</span>
      <Button variant="ghost" aria-label="close error" title="close error" onClick={() => setError('')}><X size={15} /></Button></div>}
    {message && <p className="model-feedback" role="status"><Check size={15} />{message}</p>}
    <div className="model-filters">
      <div className="model-search"><Search size={16} /><Input type="search" aria-label="search" placeholder={t('searchModelPlaceholder')}
        value={filters.search} onChange={event => changeFilters({ search: event.target.value })} /></div>
      <select aria-label="channel" value={filters.channel} onChange={event => changeFilters({ channel: event.target.value })}>
        <option value="all">{t('allChannels')}</option>{channels.map(id => <option value={id} key={id}>{channelName(id)}</option>)}
      </select>
      <select aria-label="capability" value={filters.capability} onChange={event => changeFilters({ capability: event.target.value })}>
        <option value="all">{t('allCapabilities')}</option><option value="text">{t('capText')}</option><option value="vision">{t('capVision')}</option><option value="reasoning">{t('capReasoning')}</option>
      </select>
      <select aria-label="availability" value={filters.availability} onChange={event => changeFilters({ availability: event.target.value })}>
        <option value="all">{t('allStatuses')}</option>{Object.entries(availabilityNames).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
      </select>
    </div>
    <div className="model-list-toolbar">
      <div className="channel-filters" role="group" aria-label="access filter">
        {([['all', t('allModelsFilter')], ['routable', t('routableFilter')], ['hidden', t('hiddenFilter')]] as const).map(([id, name]) =>
          <button key={id} aria-pressed={filters.access === id} onClick={() => changeFilters({ access: id })}>{name}</button>)}
      </div>
      <span role="status" data-testid="model-result-count">{number(models.length)} / {number(summary.catalog.length)} {t('modelsCount')}</span>
      {filtered && <Button variant="ghost" onClick={() => changeFilters(initialFilters)}><X size={14} />{t('clearFilters')}</Button>}
    </div>
    <div className="model-list-toolbar">
      <label><input type="checkbox" role="switch" checked={summary.settings.hideFreeModels === true}
        disabled={visibilitySaving} onChange={event => { void saveVisibility({ hideFreeModels: event.target.checked }) }} /> {visibility.hideFree}</label>
      <label><input type="checkbox" role="switch" checked={summary.settings.hideEacModels === true}
        disabled={visibilitySaving} onChange={event => { void saveVisibility({ hideEacModels: event.target.checked }) }} /> {visibility.hideEac}</label>
    </div>
    {test && <section className={`model-test-result model-test-${test.state}`} aria-label={t('testing')} aria-live="polite">
      <div className="model-test-heading"><div><strong>
        {test.state === 'pending' ? t('testing') : test.state === 'success' ? t('testCompleted') : test.state === 'cancelled' ? t('testCancelled') : t('testFailed')}
      </strong><span>{test.model.name}{test.result && ` · ${number(test.result.latencyMs)} ms`}</span></div>
        {test.state === 'pending' ? <Button variant="outline" onClick={cancel}><Square size={14} />{t('cancelTest')}</Button>
          : <Button variant="ghost" aria-label="close" title="close" onClick={() => setTest(undefined)}><X size={15} /></Button>}
      </div>
      {test.state === 'success' && <><pre>{test.result?.text}</pre>{test.result?.persisted === false && <p role="status">{t('testSuccessNotSaved')}</p>}</>}
      {test.state === 'error' && <p>{test.error}</p>}
    </section>}
    {models.length ? <div className="model-table" role="table" aria-label={t('navModels')} aria-rowcount={models.length + 1} aria-colcount={5}>
      <div className="model-table-header" role="row"><span role="columnheader">{t('colModelId')}</span><span role="columnheader">{t('colChannelCaps')}</span>
        <span role="columnheader">{t('colContextOutput')}</span><span role="columnheader">{t('colAvailability')}</span><span role="columnheader">{t('colActions')}</span></div>
      <div ref={scrollRef} className="model-scroll" role="rowgroup" tabIndex={0} aria-label="scroll" onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          virtual.scrollToIndex(event.key === 'Home' ? 0 : models.length - 1, { align: event.key === 'Home' ? 'start' : 'end' })
        }
      }}>
        <div className="model-virtual-content" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map(item => {
            const model = models[item.index]
            const state = model.availabilitySource === 'listing' ? 'listed' : model.availability ?? 'unknown'
            const manual = model.availabilitySource === 'manual'
            const failed = manual && state === 'unknown'
            const availabilityName = failed ? t('avail_tested_failed') : manual && state === 'available' ? t('avail_tested_available') : availabilityNames[state] ?? t('avail_unknown_state')
            const disabledReason = !summary.settings.enabled ? t('servicePaused') : !model.routable && !model.hiddenByUser ? (isEn ? 'Model not public, check channel accounts' : '模型尚未公开，请检查渠道账号或模型设置') : operation ? (isEn ? 'Please wait for current operation' : '请等待当前操作完成') : ''
            return <div role="row" aria-rowindex={item.index + 2} key={item.key} data-index={item.index} data-model-id={model.id}
              className="model-table-row" ref={virtual.measureElement} style={{ transform: `translateY(${item.start}px)` }}
              onFocusCapture={() => setFocusedId(model.id)} onBlurCapture={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(undefined)
              }}>
              <div role="cell" className="model-identity"><strong>{model.name}</strong><code>{model.id}</code></div>
              <div role="cell" className="model-source"><span>{channelName(model.channel)}</span><div className="model-capabilities">
                <Badge>{model.vision ? (isEn ? 'Vision' : '视觉') : (isEn ? 'Text' : '纯文本')}</Badge>{model.reasoning && <Badge tone="blue">{isEn ? 'Reasoning' : '思考'}</Badge>}</div></div>
              <div role="cell" className="model-limits"><span title={model.contextWindow ? `${model.contextWindow} Token` : undefined}>{capacity(model.contextWindow)} <small>{t('capContext')}</small></span>
                <span title={model.maxOutput ? `${model.maxOutput} Token` : undefined}>{capacity(model.maxOutput)} <small>{t('capOutput')}</small></span></div>
              <div role="cell" className="model-state"><Badge tone={state === 'available' ? 'success' : failed || ['unavailable', 'throttled', 'region-blocked'].includes(state) ? 'warning' : 'neutral'}>
                {availabilityName}</Badge>
                {manual && state !== 'available' && model.detail && <small title={model.detail}
                  style={{ maxWidth: '100%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.detail}</small>}
                {!model.routable && <small>{model.hiddenByUser ? visibility.hidden : (isEn ? 'Not public' : '未公开')}</small>}
                {model.ttftMs != null && <small>{t('ttftLabel')} {number(model.ttftMs)} ms</small>}</div>
              <div role="cell" className="model-row-actions">
                {['anonymous', 'kilo', 'eac', 'aggregate', 'combo'].includes(model.channel) && <Button variant="ghost"
                  disabled={visibilitySaving || model.hiddenByGroup === true}
                  title={model.hiddenByGroup ? visibility.groupHidden : model.hiddenByUser ? visibility.show : visibility.hide}
                  aria-label={`${model.hiddenByUser ? visibility.show : visibility.hide}：${model.id}`}
                  onClick={() => { const ids = summary.settings.hiddenModelIds ?? []; void saveVisibility({
                    hiddenModelIds: ids.includes(model.id) ? ids.filter(id => id !== model.id) : [...ids, model.id],
                  }) }}>{model.hiddenByUser ? <Eye size={16} /> : <EyeOff size={16} />}</Button>}
                <Button variant="ghost" title={`Copy ${model.id}`} aria-label={`Copy model ID: ${model.id}`} onClick={() => copyModelId(model)}
                  className={copied === model.id ? 'md-copy-done' : ''}>
                  {copied === model.id ? <Check size={16} /> : <Copy size={16} />}
                </Button>
                <Button variant="outline" disabled={!!disabledReason} title={disabledReason || `${t('testBtn')} ${model.name}`}
                  aria-label={`${t('testBtn')}: ${model.id}`} onClick={() => { void run('test', model) }}
                  className={operation === 'test' && test?.model.id === model.id ? 'md-testing' : ''}>
                  {operation === 'test' && test?.model.id === model.id ? <LoaderCircle size={14} className="spinning" /> : <Play size={14} />}{t('testBtn')}
                </Button>
              </div>
            </div>
          })}
        </div>
      </div>
    </div> : <div className="model-empty"><Boxes size={28} /><h2>{summary.catalog.length ? t('noMatchingModels') : t('emptyCatalog')}</h2>
      <p>{summary.catalog.length ? t('adjustFiltersHint') : t('refreshCatalogHint')}</p>
      {filtered && <Button variant="outline" onClick={() => changeFilters(initialFilters)}><SlidersHorizontal size={15} />{t('clearFilters')}</Button>}
    </div>}
    <p className="footnote">{t('catalogDisclaimer')}</p>
  </div>
}
