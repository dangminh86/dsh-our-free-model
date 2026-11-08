import { useEffect, useRef, useState } from 'react'
import { providers } from 'ofm-provider-list'
import { Activity, ArrowRight, ArrowUpRight, Boxes, Check, CircleCheck, Copy, Handshake, Layers3, Network, RefreshCw, Terminal, Zap } from 'lucide-react'
import { Badge, Button, Card } from './ui'
import '../usage.css'
import type { Host, Snapshot } from '../types'
import { useT, useLocale } from '../i18n'

export function Overview({ summary, stats, host }: Snapshot & { host: Host }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'

  const number = (value: number) => new Intl.NumberFormat(isEn ? 'en-US' : 'zh-CN').format(value)
  const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : number(value)

  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const metricRows = [
    { name: t('metricRoutable'), value: number(summary.catalog.filter(model => model.routable).length), icon: Boxes, detail: t('metricRoutableDetail') },
    { name: t('metricTurns'), value: number(stats.turns), icon: Layers3, detail: `${number(stats.requests)} ${t('metricRequests')}` },
    { name: t('metricTokens'), value: compact(stats.grand.input + stats.grand.output), icon: Zap, detail: isEn ? `In ${compact(stats.grand.input)} · Out ${compact(stats.grand.output)}` : `输入 ${compact(stats.grand.input)} · 输出 ${compact(stats.grand.output)}` },
    { name: t('metricRecovered'), value: number(stats.recoveredTurns), icon: Activity, detail: `${t('metricFailed')} ${number(stats.failedTurns)} ${isEn ? 'turns' : '回合'}` },
  ]
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(today); at.setDate(at.getDate() - 6 + index)
    const id = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    return { id, value: stats.days.find(row => row.day === id)?.total ?? 0 }
  })
  const total = days.reduce((sum, row) => sum + row.value, 0)
  const max = Math.max(1, ...days.map(row => row.value))
  const failures = [...stats.samples].reverse().filter(row => row.ok === false).slice(0, 4)
  const sources = [
    { name: t('sourceAnon'), sub: t('sourceAnonSub'), icon: Zap, count: summary.catalog.filter(row => row.channel === 'anonymous' || row.channel === 'kilo').length, page: 'models' as const },
    { name: t('sourceEacRouter'), sub: `${providers.length} ${t('sourceEacRouterSub')}`, icon: Network, count: summary.catalog.filter(row => !['anonymous', 'kilo', 'eac'].includes(row.channel)).length, page: 'channels' as const },
    { name: t('sourceEacPay'), sub: summary.eacAuth?.local ? t('sourceEacPayAuthed') : t('sourceEacPayUnauthed'), icon: Handshake, count: summary.catalog.filter(row => row.channel === 'eac').length, page: 'eac' as const },
  ]

  const copyEndpoint = () => {
    void host.copy(`${summary.baseUrl}/v1`).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    }).catch(host.error)
  }

  return <div className="dashboard" data-testid="overview-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">{t('overviewHeading')}</div><h1>{t('overviewTitle')}</h1><p>{t('overviewDesc')}</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => {
        setRefreshing(true); void host.refresh().catch(host.error).finally(() => setRefreshing(false))
      }}><RefreshCw size={15} className={refreshing ? 'spinning' : ''} />{refreshing ? t('overviewRefreshing') : t('overviewRefresh')}</Button></header>

    <div className="dashboard-metrics">{metricRows.map(metric => <Card className="dashboard-metric ov-metric" key={metric.name}>
      <div><span>{metric.name}</span><div className="ov-metric-icon"><metric.icon size={17} /></div></div>
      <strong>{metric.value}</strong><p>{metric.detail}</p>
    </Card>)}</div>

    <div className="dashboard-main-grid">
      <Card className="usage-panel ov-chart-panel">
        <div className="card-heading"><div><h2>{t('chartTokenUsage')}</h2><p>{t('chartLast7Days')}</p></div><Badge>{t('chartLast7DaysBadge')}</Badge></div>
        <div className="usage-total ov-chart-total">{compact(total)} <span>Token</span></div>
        <div className="dashboard-chart ov-chart" role="img" aria-label={`${t('chartLast7Days')}：${days.map(day => `${day.id} ${day.value}`).join('；')}`}>
          <div className="chart-grid-lines"><span /><span /><span /><span /></div>
          {days.map(day => <div className="dashboard-chart-column ov-chart-col" key={day.id} title={`${day.id} · ${number(day.value)} Token`}>
            <div className={`dashboard-chart-bar ${day.value === 0 ? 'zero' : ''}`} style={{ height: `${Math.max(2, day.value / max * 80)}%` }} />
            <span>{day.id.slice(5).replace('-', '/')}</span>
          </div>)}
          {total === 0 && <div className="chart-empty ov-chart-empty"><Activity size={22} /><span>{t('noRecordsYet')}</span><small>{t('noRecordsHint')}</small></div>}
        </div>
        <div className="card-foot"><span>{t('chartCountByRecord')}</span><button onClick={() => host.navigate('usage')}>{t('viewAllUsage')} <ArrowRight size={14} /></button></div>
      </Card>

      <Card className="quick-connect ov-quick">
        <div className="quick-icon ov-quick-icon"><Terminal size={20} /></div>
        <h2>{t('navConnection')}</h2><p>{isEn ? 'OpenAI Compatible · Chat Completions / Responses' : 'OpenAI 兼容 · Chat Completions / Responses'}</p>
        <label>API BASE URL</label>
        <div className="quick-endpoint ov-endpoint"><code>{summary.baseUrl}/v1</code>
          <Button variant="ghost" aria-label={t('copyApiUrl')} onClick={copyEndpoint} title={t('copyApiUrl')}
            className={copied ? 'ov-copied' : ''}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
        </div>
        {copied && <span className="copy-feedback" role="status">{t('apiUrlCopied')}</span>}
        <div className="connect-steps"><span>{t('sessionLocal')}</span><span>{t('authBearer')}</span><span>{t('listenLoopback')}</span></div>
        <Button className="connect-button" onClick={() => host.navigate('connection')}>{t('viewConnectionConfig')} <ArrowUpRight size={16} /></Button>
        <div className="connection-footnote"><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? t('serviceEnabled') : t('servicePaused')}</div>
      </Card>
    </div>

    <div className="dashboard-bottom-grid">
      <Card className="ov-sources">
        <div className="card-heading"><div><h2>{t('modelSources')}</h2><p>{t('allChannelsOneEndpoint')}</p></div><Network size={18} /></div>
        <div className="source-list ov-source-list">{sources.map((source, index) => <button className="source-row ov-source-row" key={source.name} onClick={() => host.navigate(source.page)}
          style={{ animationDelay: `${index * 60}ms` }}>
          <span className="source-icon"><source.icon size={18} /></span>
          <span><strong>{source.name}</strong><small>{source.sub}</small></span>
          <Badge>{source.count} {t('modelCountBadge')}</Badge><ArrowRight size={14} />
        </button>)}</div>
      </Card>

      <Card className="ov-failures">
        <div className="card-heading"><div><h2>{t('runtimeCheck')}</h2><p>{t('runtimeDesc')}</p></div>
          <Badge tone={failures.length ? 'warning' : 'success'}>{failures.length ? t('hasFailures') : t('noFailuresBadge')}</Badge></div>
        <div className="runtime-check"><CircleCheck size={17} /><span>{t('channelModule')}</span><strong>{summary.channels.state === 'ready' ? t('stateReady') : summary.channels.state === 'failed' ? t('stateFailed') : t('stateInit')}</strong></div>
        <div className="runtime-check"><RefreshCw size={17} /><span>{t('modelAutoRefresh')}</span><strong>{summary.automaticRefresh ? t('everyXMinutes').replace('{min}', String(summary.settings.probeIntervalMinutes)) : t('statusPaused')}</strong></div>
        {failures.length ? <div className="failure-list ov-failure-list">{failures.map((row, index) =>
          <div key={`${row.at}-${index}`} className="ov-failure-row">
            <span>{row.model ?? t('unknownModel')}</span>
            <small>{row.at ? new Date(row.at).toLocaleTimeString(isEn ? 'en-US' : 'zh-CN') : t('unknownTime')} · {t('reqUnfinished')}</small>
          </div>)}</div>
          : <div className="runtime-empty ov-runtime-empty"><CircleCheck size={18} /><span>{t('noFailuresInSamples')}</span></div>}
        <div className="card-foot"><span title={summary.dataDir}>{t('dataLocalOnly')}</span><button onClick={() => host.navigate('settings')}>{t('serviceSettings')} <ArrowRight size={14} /></button></div>
      </Card>
    </div>
  </div>
}
