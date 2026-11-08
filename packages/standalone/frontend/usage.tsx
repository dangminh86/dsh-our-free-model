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
    { name: t('navUsage') === 'Usage Statistics' ? 'User Turns' : '用户回合', value: stats.turns, detail: t('usageTurnsDesc'), icon: Layers3 },
    { name: t('usageReqs'), value: stats.requests, detail: t('usageReqsDesc'), icon: Activity },
    { name: t('usageInputTokens'), value: stats.grand.input, detail: t('usageTokensDesc'), icon: ArrowDownToLine },
    { name: t('usageOutputTokens'), value: stats.grand.output, detail: t('usageTokensDesc'), icon: ArrowUpFromLine },
    { name: t('usageFailedTurns'), value: stats.failedTurns, detail: t('usageFailedDesc'), icon: CircleAlert },
    { name: t('usageRecoveredTurns'), value: stats.recoveredTurns, detail: t('usageRecoveredDesc'), icon: RotateCcw },
  ]

  const refresh = async () => {
    if (refreshingRef.current || !activeRef.current) return
    const started = ++generation.current
    const isCurrent = () => started === generation.current && activeRef.current
    refreshingRef.current = true
    setRefreshing(true); setMessage(''); setError('')
    try {
      await host.refresh()
      if (isCurrent()) setMessage(t('settingsSaved'))
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.name === 'TimeoutError' ? t('errTimeout')
        : reason instanceof TypeError && /fetch/i.test(reason.message) ? t('settingsConnectErr')
        : reason.message : t('errRequestFailed'))
    } finally {
      if (isCurrent()) { refreshingRef.current = false; setRefreshing(false) }
    }
  }

  if (!active) return null

  return <div className="usage-browser" data-testid="usage-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / USAGE</div>
      <h1>{t('navUsage')}</h1><p>{isEn ? 'View local cumulative usage and daily trends.' : '查看本机累计用量与每日趋势。'}</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => { void refresh() }}>
        <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />{refreshing ? t('updatingStats') : t('updateStats')}
      </Button>
    </header>
    {message && <p className="usage-feedback" role="status">{message}</p>}
    {error && <div className="channel-error" role="alert"><CircleAlert size={16} /><span>{error}</span>
      <Button variant="ghost" aria-label="关闭统计错误提示" onClick={() => setError('')}><X size={15} /></Button></div>}
    <div className="usage-metrics">{metrics.map(metric => <Card className="dashboard-metric ov-metric" key={metric.name}>
      <div><span>{metric.name}</span><div className="ov-metric-icon"><metric.icon size={17} /></div></div>
      <strong title={number(metric.value)} data-metric={metric.name}>{metric.name.includes('Token') ? compact(metric.value) : number(metric.value)}</strong><p>{metric.detail}</p>
    </Card>)}</div>
    <div className="usage-scope"><span>{t('usageCumulativeScope')}</span>
      <span>{t('usagePhysicalFailures')} <strong data-testid="usage-request-failures">{number(stats.requestFailures)}</strong></span>
      <span>{t('usageReasoningTokens')} <strong>{number(stats.grand.reasoning)}</strong></span></div>
    {(stats.logicalEstimated || stats.requestFailuresEstimated) && <p className="usage-estimated" role="note">
      <CircleAlert size={15} /><span>{isEn ? 'Historical statistics include estimates.' : '历史统计含估算：新记录沿用独立的请求与回合统计。'}</span></p>}
    <Card className="usage-trend">
      <div className="card-heading"><div><h2>{t('dailyTokenUsage')}</h2><p>{t('lastXDays').replace('{days}', String(period))}</p></div>
        <div className="channel-filters" role="group" aria-label="趋势时间范围">{[7, 14, 30].map(count =>
          <button key={count} aria-pressed={period === count} onClick={() => setPeriod(count)}>{t('daysCount').replace('{days}', String(count))}</button>)}</div>
      </div>
      <div className="usage-window-total"><strong data-testid="usage-window-total">{number(windowTotal)}</strong><span>{t('tokensPerPeriod')}</span></div>
      <p className="usage-scroll-hint">{t('scrollHorizontalHint')}</p>
      <div className="usage-trend-scroll"><div className="usage-trend-chart" style={{ minWidth: period * 35 }}
        role="img" aria-label={`${t('dailyTokenUsage')}：${days.map(day => `${day.day} ${number(day.total)}`).join('；')}`}>
        {days.map(day => <div className="usage-day" key={day.day} tabIndex={0} title={`${day.day} · ${number(day.total)} Token`}
          aria-label={`${day.day}：${number(day.total)} Token`}>
          <div className="usage-day-track"><div className={`usage-day-bar ${day.total ? '' : 'zero'}`} style={{ height: `${Math.max(1, day.total / max * 100)}%` }} /></div>
          <span>{day.day.slice(5).replace('-', '/')}</span>
        </div>)}
      </div></div>
      {windowTotal === 0 && <p className="usage-window-empty" role="status">{hasHistory ? (isEn ? 'No token usage recorded for this period. Cumulative stats retain history.' : '所选时段没有已记录的 Token 用量，累计统计仍保留历史记录。') : (isEn ? 'No requests recorded yet. Usage will appear here once clients connect.' : '还没有调用记录，接入客户端后用量会显示在这里。')}</p>}
      <div className="card-foot"><span>{days[0].day} — {days[days.length - 1].day} · {t('localSolarDay')}</span><span>{t('unreportedUsageNote')}</span></div>
    </Card>
    <Card className="usage-model-panel">
      <div className="card-heading"><div><h2>{t('byModelStats')}</h2><p>{t('max20PerPage')}</p></div>
        <Badge>{number(stats.models.length)} {t('modelsCount')}</Badge></div>
      <div className="usage-model-filters"><div className="usage-model-search"><Search size={16} />
        <Input type="search" aria-label="搜索统计模型" placeholder={t('searchUsagePlaceholder')} value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }} /></div>
        <select aria-label="统计模型排序" value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>
          <option value="calls">{t('sortMostCalls')}</option><option value="tokens">{t('sortMostTokens')}</option>
          <option value="failedTurns">{t('sortMostFailures')}</option><option value="name">{t('sortName')}</option>
        </select>
        {search && <Button variant="ghost" onClick={() => { setSearch(''); setPage(1) }}><X size={14} />{isEn ? 'Clear search' : '清空搜索'}</Button>}
      </div>
      {models.total ? <><p className="usage-scroll-hint">{t('scrollHorizontalHint')}</p>
      <div className="usage-model-scroll" tabIndex={0} role="region" aria-label={t('byModelStats')}>
        <table className="usage-model-table"><thead><tr>
          <th scope="col">{t('colModelId')}</th><th scope="col">{t('colTurns')}</th><th scope="col">{t('usageReqs')}</th><th scope="col">{t('colInput')}</th>
          <th scope="col">{t('colOutput')}</th><th scope="col">{t('usageFailedTurns')}</th><th scope="col">{t('usageRecoveredTurns')}</th><th scope="col">{t('colTtft')}</th><th scope="col">{t('colTps')}</th>
        </tr></thead><tbody>{models.rows.map(model => <tr key={model.model} data-usage-model={model.model}>
          <td><strong>{model.name}</strong><code>{model.model}</code></td><td>{number(model.turns)}</td>
          <td>{number(model.calls)}<small>{isEn ? `Failed ${number(model.failed)}` : `失败 ${number(model.failed)}`}</small></td>
          <td>{number(model.input)}</td><td>{number(model.output)}</td><td>{number(model.failedTurns)}</td>
          <td>{number(model.recoveredTurns)}</td><td>{measured(model.avgTtftMs)}<small>ms</small></td><td>{measured(model.tps)}<small>Token/s</small></td>
        </tr>)}</tbody></table>
      </div></> : <div className="usage-empty"><Activity size={25} /><h3>{search.trim() ? t('noMatchingModels') : (isEn ? 'No model usage recorded yet' : '还没有模型用量记录')}</h3>
        <p>{search.trim() ? (isEn ? 'Try another name or ID, or clear search.' : '试试其他名称或 ID，或清空搜索。') : (isEn ? 'Once clients connect and send messages, usage will appear here.' : '接入客户端并发送消息后，模型统计会显示在这里。')}</p></div>}
      <div className="usage-pagination"><span data-testid="usage-model-count">{number(models.total)} / {number(stats.models.length)} {t('modelsCount')}</span>
        <span>{t('pageIndicator').replace('{page}', String(models.page)).replace('{pages}', String(models.pages))}</span><Button variant="outline" aria-label={t('prevPage')} disabled={models.page === 1}
          onClick={() => setPage(models.page - 1)}><ChevronLeft size={15} />{t('prevPage')}</Button>
        <Button variant="outline" aria-label={t('nextPage')} disabled={models.page === models.pages}
          onClick={() => setPage(models.page + 1)}>{t('nextPage')}<ChevronRight size={15} /></Button></div>
    </Card>
    <p className="footnote">{t('usageFootnote')}</p>
  </div>
}
