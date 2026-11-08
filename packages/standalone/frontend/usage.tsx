import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, CircleAlert, Layers3, RefreshCw, Search, RotateCcw, X } from 'lucide-react'
import { Badge, Button, Card, Input } from './components/ui'
import { usageDays, usageModels } from './usage-data.mjs'
import type { Host, Stats, UsageModel } from './types'
import './usage.css'
import { useT, useLocale } from './i18n'

export function Usage({ stats, host, active }: { stats: Stats; host: Host; active: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'

  const number = (value: number) => new Intl.NumberFormat(isEn ? 'en-US' : 'zh-CN').format(value)
  const compact = (value: number) => value >= 1e6 ? `${Number((value / 1e6).toFixed(1))}M`
    : value >= 1e3 ? `${Number((value / 1e3).toFixed(1))}K` : number(value)
  const measured = (value?: number | null) => value != null && Number.isFinite(value) ? number(value) : '—'

  const [period, setPeriod] = useState(14)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('calls')
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refreshingRef = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (!active) {
      generation.current++
      refreshingRef.current = false
      setRefreshing(false); setMessage(''); setError('')
    }
    return () => { generation.current++ }
  }, [active])

  const days: { day: string; total: number }[] = usageDays(stats.days, period)
  const windowTotal = days.reduce((sum, day) => sum + day.total, 0)
  const max = Math.max(1, ...days.map(day => day.total))
  const models: { total: number; pages: number; page: number; rows: UsageModel[] } = usageModels(stats.models, { search, sort, page })
  useEffect(() => { if (page !== models.page) setPage(models.page) }, [page, models.page])
  const hasHistory = stats.requests > 0 || stats.turns > 0 || stats.models.length > 0 || stats.days.length > 0

  const metrics = [
    { name: t('usgUserTurns'), value: stats.turns, detail: t('usgUserTurnsDetail'), icon: Layers3 },
    { name: t('usgPhysRequests'), value: stats.requests, detail: t('usgPhysRequestsDetail'), icon: Activity },
    { name: t('usgInputTokens'), value: stats.grand.input, detail: t('usgTokensDetail'), icon: ArrowDownToLine },
    { name: t('usgOutputTokens'), value: stats.grand.output, detail: t('usgTokensDetail'), icon: ArrowUpFromLine },
    { name: t('usgFailedTurns'), value: stats.failedTurns, detail: t('usgFailedTurnsDetail'), icon: CircleAlert },
    { name: t('usgRecoveredTurns'), value: stats.recoveredTurns, detail: t('usgRecoveredTurnsDetail'), icon: RotateCcw },
  ]

  const refresh = async () => {
    if (refreshingRef.current || !activeRef.current) return
    const started = ++generation.current
    const isCurrent = () => started === generation.current && activeRef.current
    refreshingRef.current = true
    setRefreshing(true); setMessage(''); setError('')
    try {
      await host.refresh()
      if (isCurrent()) setMessage(t('usgUpdated'))
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.name === 'TimeoutError' ? t('errTimeout')
        : reason instanceof TypeError && /fetch/i.test(reason.message) ? t('settingsConnectErr')
        : reason.message : t('cxOpFailed'))
    } finally {
      if (isCurrent()) { refreshingRef.current = false; setRefreshing(false) }
    }
  }

  if (!active) return null

  return <div className="usage-browser" data-testid="usage-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / USAGE</div>
      <h1>{t('usgTitle')}</h1><p>{t('usgSubtitle')}</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => { void refresh() }}>
        <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />{refreshing ? t('usgUpdating') : t('usgUpdate')}
      </Button>
    </header>
    {message && <p className="usage-feedback" role="status">{message}</p>}
    {error && <div className="channel-error" role="alert"><CircleAlert size={16} /><span>{error}</span>
      <Button variant="ghost" aria-label={t('usgCloseErr')} onClick={() => setError('')}><X size={15} /></Button></div>}
    <div className="usage-metrics">{metrics.map(metric => <Card className="dashboard-metric ov-metric" key={metric.name}>
      <div><span>{metric.name}</span><div className="ov-metric-icon"><metric.icon size={17} /></div></div>
      <strong title={number(metric.value)} data-metric={metric.name}>{metric.name.includes('Token') ? compact(metric.value) : number(metric.value)}</strong><p>{metric.detail}</p>
    </Card>)}</div>
    <div className="usage-scope"><span>{t('usgCumulativeScope')}</span>
      <span>{t('usgPhysFailures')} <strong data-testid="usage-request-failures">{number(stats.requestFailures)}</strong></span>
      <span>{t('usgReasoningTokens')} <strong>{number(stats.grand.reasoning)}</strong></span></div>
    {(stats.logicalEstimated || stats.requestFailuresEstimated) && <p className="usage-estimated" role="note">
      <CircleAlert size={15} /><span>{t('usgHistoryEstimated')}
        {stats.logicalEstimated && t('usgLogicalEstimated')}
        {stats.requestFailuresEstimated && t('usgFailuresEstimated')}
        {t('usgEstimatesTail')}</span></p>}
    <Card className="usage-trend">
      <div className="card-heading"><div><h2>{t('usgDailyTokens')}</h2><p>{t('usgDailySubtitle').replace('{days}', String(period))}</p></div>
        <div className="channel-filters" role="group" aria-label={t('usgTrendPeriodAria')}>{[7, 14, 30].map(count =>
          <button key={count} aria-pressed={period === count} onClick={() => setPeriod(count)}>{t('usgDaysUnit').replace('{days}', String(count))}</button>)}</div>
      </div>
      <div className="usage-window-total"><strong data-testid="usage-window-total">{number(windowTotal)}</strong><span>{t('usgTokenPeriodUnit')}</span></div>
      <p className="usage-scroll-hint">{t('usgScrollHint')}</p>
      <div className="usage-trend-scroll"><div className="usage-trend-chart" style={{ minWidth: period * 35 }}
        role="img" aria-label={t('usgChartAria').replace('{period}', String(period)).replace('{data}', days.map(day => `${day.day} ${number(day.total)}`).join('；'))}>
        {days.map(day => <div className="usage-day" key={day.day} tabIndex={0} title={`${day.day} · ${number(day.total)} Token`}
          aria-label={`${day.day}：${number(day.total)} Token`}>
          <div className="usage-day-track"><div className={`usage-day-bar ${day.total ? '' : 'zero'}`} style={{ height: `${Math.max(1, day.total / max * 100)}%` }} /></div>
          <span>{day.day.slice(5).replace('-', '/')}</span>
        </div>)}
      </div></div>
      {windowTotal === 0 && <p className="usage-window-empty" role="status">{hasHistory ? t('usgWindowEmptyHistory') : t('usgWindowEmptyNew')}</p>}
      <div className="card-foot"><span>{days[0]?.day} — {days[days.length - 1]?.day} · {t('usgLocalDaysFoot')}</span><span>{t('usgUnreportedFoot')}</span></div>
    </Card>
    <Card className="usage-model-panel">
      <div className="card-heading"><div><h2>{t('usgByModel')}</h2><p>{t('usgByModelSub')}</p></div>
        <Badge>{number(stats.models.length)} {t('modelCountBadge')}</Badge></div>
      <div className="usage-model-filters"><div className="usage-model-search"><Search size={16} />
        <Input type="search" aria-label={t('usgSearchAria')} placeholder={t('usgSearchPlaceholder')} value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }} /></div>
        <select aria-label={t('usgSortAria')} value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>
          <option value="calls">{t('usgSortMostCalls')}</option><option value="tokens">{t('usgSortMostTokens')}</option>
          <option value="failedTurns">{t('usgSortMostFailures')}</option><option value="name">{t('usgSortName')}</option>
        </select>
        {search && <Button variant="ghost" onClick={() => { setSearch(''); setPage(1) }}><X size={14} />{t('usgClearSearch')}</Button>}
      </div>
      {models.total ? <><p className="usage-scroll-hint">{t('usgTableScrollHint')}</p>
      <div className="usage-model-scroll" tabIndex={0} role="region" aria-label={t('usgTableAria')}>
        <table className="usage-model-table"><thead><tr>
          <th scope="col">{t('usgColModel')}</th><th scope="col">{t('usgColTurns')}</th><th scope="col">{t('usgColCalls')}</th><th scope="col">{t('usgColInput')}</th>
          <th scope="col">{t('usgColOutput')}</th><th scope="col">{t('usgColFailed')}</th><th scope="col">{t('usgColRecovered')}</th><th scope="col">{t('usgColTtft')}</th><th scope="col">{t('usgColTps')}</th>
        </tr></thead><tbody>{models.rows.map(model => <tr key={model.model} data-usage-model={model.model}>
          <td><strong>{model.name}</strong><code>{model.model}</code></td><td>{number(model.turns)}</td>
          <td>{number(model.calls)}<small>{t('usgFailedSub').replace('{num}', number(model.failed))}</small></td>
          <td>{number(model.input)}</td><td>{number(model.output)}</td><td>{number(model.failedTurns)}</td>
          <td>{number(model.recoveredTurns)}</td><td>{measured(model.avgTtftMs)}<small>ms</small></td><td>{measured(model.tps)}<small>Token/s</small></td>
        </tr>)}</tbody></table>
      </div></> : <div className="usage-empty"><Activity size={25} /><h3>{search.trim() ? t('usgEmptyMatch') : t('usgEmptyRecords')}</h3>
        <p>{search.trim() ? t('usgEmptyMatchSub') : t('usgEmptyRecordsSub')}</p></div>}
      <div className="usage-pagination"><span data-testid="usage-model-count">{number(models.total)} / {number(stats.models.length)} {t('modelCountBadge')}</span>
        <span>{t('usgPageCount').replace('{page}', String(models.page)).replace('{pages}', String(models.pages))}</span><Button variant="outline" aria-label={t('usgPrevPage')} disabled={models.page === 1}
          onClick={() => setPage(models.page - 1)}><ChevronLeft size={15} />{t('usgPrevPage')}</Button>
        <Button variant="outline" aria-label={t('usgNextPage')} disabled={models.page === models.pages}
          onClick={() => setPage(models.page + 1)}>{t('usgNextPage')}<ChevronRight size={15} /></Button></div>
    </Card>
    <p className="footnote">{t('usgFootnote')}</p>
  </div>
}
