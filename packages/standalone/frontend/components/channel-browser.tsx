import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Network, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { providers } from 'ofm-provider-list'
import { shared } from 'ofm-shared-client'
import { Badge, Button, Card, Input } from './ui'
import type { Summary } from '../types'
import { useT, useLocale } from '../i18n'

interface Status { closed?: boolean; accounts?: { total: number; enabled: number }; models?: { total: number; disabled: number } }
type Rpc = (method: string, payload?: object) => Promise<any>

export function ChannelBrowser({ rpc, summary }: { rpc: Rpc; summary: Summary & { reload?(): void } }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'

  const [statuses, setStatuses] = useState<Record<string, Status>>()
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, select] = useState<string>()
  const [auto, setAuto] = useState<{ enabled: boolean; running?: boolean; ranToday?: boolean }>()
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  const sequence = useRef(0)
  const detailHeading = useRef<HTMLHeadingElement>(null)

  const reload = useCallback(async () => {
    const started = ++sequence.current
    try {
      const value = await rpc('provider.status', { providers: providers.map(row => row.id) })
      if (!mounted.current || started !== sequence.current) return
      setStatuses(value.statuses ?? {})
      setError('')
    } catch (failure) {
      if (mounted.current && started === sequence.current) setError((failure as Error).message)
    }
  }, [rpc])

  useEffect(() => {
    mounted.current = true
    void reload()
    void rpc('usage.autoCheckin', {}).then(value => {
      if (mounted.current) setAuto(value.autoCheckin)
    }).catch(() => {})
    const timer = setInterval(() => { if (!document.hidden) void reload() }, 45000)
    return () => { mounted.current = false; sequence.current++; clearInterval(timer) }
  }, [rpc, reload])

  useEffect(() => {
    if (selected) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      detailHeading.current?.focus({ preventScroll: true })
    }
  }, [selected])

  const onChanged = useCallback(() => {
    void reload()
    window.dispatchEvent(new CustomEvent('ofm:channels'))
    summary.reload?.()
  }, [reload, summary.reload])

  const onError = useCallback((_provider: unknown, failure: Error) => { if (mounted.current) setError(failure.message) }, [])
  const cardT = Object.assign((key: string) => shared.DICT.zh[key] ?? key, { locale: isEn ? 'en' : 'zh' })
  const connected = providers.filter(provider => statuses?.[provider.id]?.accounts?.enabled && !statuses[provider.id].closed).length
  const accounts = Object.values(statuses ?? {}).reduce((sum, row) => sum + (row.accounts?.total ?? 0), 0)
  const selectedProvider = providers.find(row => row.id === selected)
  const rows = providers.filter(provider => {
    const status = statuses?.[provider.id]
    const isConnected = (status?.accounts?.enabled ?? 0) > 0 && !status?.closed
    return `${provider.name} ${provider.org}`.toLowerCase().includes(search.toLowerCase().trim())
      && (filter === 'all' || (filter === 'connected' ? isConnected : !isConnected))
  })

  const counts: Record<string, number> = {
    all: providers.length,
    connected,
    pending: providers.filter(provider => {
      const status = statuses?.[provider.id]
      return !status || status.closed || (status.accounts?.enabled ?? 0) <= 0
    }).length,
  }

  return <>
    <div className="channel-summary-strip">
      <div className="ch-metric"><span className="ch-metric-icon"><Network size={16} /></span>
        <div className="ch-metric-body"><span className="ch-metric-label">{t('cbConnectedChannels')}</span>
          <strong className="ch-metric-value">{statuses ? connected : <span className="ch-skeleton" />}<small> / {providers.length}</small></strong></div></div>
      <div className="ch-metric"><span className="ch-metric-icon"><ShieldCheck size={16} /></span>
        <div className="ch-metric-body"><span className="ch-metric-label">{t('cbLocalAccounts')}</span>
          <strong className="ch-metric-value">{statuses ? accounts : <span className="ch-skeleton" />}</strong></div></div>
      <div className="checkin-control"><span className="status-dot" /><span>{auto?.running ? t('cbCheckinRunning') : auto?.ranToday ? t('cbCheckinRanToday') : t('cbDailyAutoCheckin')}</span>
        <button type="button" role="switch" aria-label={t('cbDailyAutoCheckin')} aria-checked={auto?.enabled === true}
          className={`ui-switch ${auto?.enabled ? 'on' : ''}`} disabled={!auto || busy} onClick={() => {
            setBusy(true)
            void rpc('usage.autoCheckin', { enabled: !auto?.enabled }).then(value => { if (mounted.current) setAuto(value.autoCheckin) })
              .catch(failure => { if (mounted.current) setError(failure.message) }).finally(() => { if (mounted.current) setBusy(false) })
          }}><span /></button>
      </div>
    </div>
    {error && <div className="channel-error" role="alert"><CircleAlert size={16} /><span>{error}</span><Button variant="ghost" onClick={() => { void reload() }}>{t('btnRetry')}</Button></div>}
    {selectedProvider ? <div className="provider-detail" data-testid="provider-detail">
      <div className="provider-detail-top"><Button variant="outline" onClick={() => select(undefined)}><ArrowLeft size={15} />{t('cbBackToAllChannels')}</Button>
        <span>{t('cbCredentialsStorageNote')}</span></div>
      <div className="provider-detail-layout"><Card className="provider-detail-sidebar"><h2 tabIndex={-1} ref={detailHeading}>{selectedProvider.name}</h2><p>{selectedProvider.org}</p>
        <div className="detail-label">{t('cbSwitchChannel')}</div>{providers.map(provider => <button className={`detail-provider-link ${provider.id === selected ? 'active' : ''}`} key={provider.id}
          onClick={() => select(provider.id)}><span>{provider.name}</span>{provider.id === selected && <Check size={14} />}</button>)}</Card>
        <div className="provider-detail-main"><div className="provider-detail-description"><h2>{t('cbAccountsAndModels')}</h2><p>{t('cbAccountsAndModelsDesc')}</p></div>
          <shared.ChannelCard key={selectedProvider.id} channel={selectedProvider} status={statuses?.[selectedProvider.id]} rpc={rpc} t={cardT} onChanged={onChanged} onError={onError} />
          <div className="detail-security-note"><ShieldCheck size={16} />{t('cbSecurityNote')}</div>
        </div></div>
    </div> : <>
      <div className="channel-toolbar"><div className="channel-search"><Search size={17} /><Input aria-label={t('cbSearchChannelsAria')} placeholder={t('cbSearchChannelsPlaceholder')} value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="channel-filters" aria-label={t('cbConnectedChannels')}>{[['all', t('cbFilterAll')], ['connected', t('cbFilterConnected')], ['pending', t('cbFilterPending')]].map(([id, label]) =>
          <button key={id} aria-pressed={filter === id} disabled={id !== 'all' && !statuses} onClick={() => setFilter(id)}>{label}<span>{id === 'all' || statuses ? counts[id] : '—'}</span></button>)}</div>
      </div>
      <div className="channel-results-meta"><span>{t('cbChannelsCount').replace('{count}', String(rows.length))}</span><span><SlidersHorizontal size={13} />{t('cbManageByProvider')}</span></div>
      <div className="provider-grid">{rows.map(provider => {
        const status = statuses?.[provider.id]
        const isClosed = status?.closed
        const isConnected = (status?.accounts?.enabled ?? 0) > 0 && !isClosed
        const stateText = isClosed ? t('cbStateClosed') : isConnected ? t('cbStateConnected') : t('cbStateDisconnected')
        return <Card className="provider-card channel-directory-row" key={provider.id}>
          <span className="provider-logo" style={{ color: provider.accent, backgroundColor: `${provider.accent}0d` }}>{provider.name.slice(0, 2).toUpperCase()}</span>
          <div className="channel-directory-name"><h2>{provider.name}</h2><div className="provider-org">{provider.org}</div><p className="provider-description">{provider.note}</p></div>
          <div className="provider-counts"><span>{t('cbAccountsLabel')} <strong>{status ? status.accounts?.total ?? 0 : '—'}</strong></span>
            <span>{t('cbModelsLabel')} <strong>{status ? Math.max(0, (status.models?.total ?? 0) - (status.models?.disabled ?? 0)) : '—'}</strong></span></div>
          <Badge tone={isConnected ? 'success' : 'neutral'}>{isConnected && <span className="status-dot" />}{stateText}</Badge>
          <Button variant="outline" className="provider-manage" onClick={() => select(provider.id)}>{isConnected ? t('cbManageBtn') : t('cbConnectBtn')}<ArrowRight size={14} /></Button>
        </Card>
      })}</div>
      {rows.length === 0 && <Card className="channel-empty"><Search size={24} /><h2>{t('cbNoMatchingChannels')}</h2><p>{t('cbNoMatchingHint')}</p><Button variant="outline" onClick={() => { setSearch(''); setFilter('all') }}>{t('cbResetFilters')}</Button></Card>}
    </>}
  </>
}
