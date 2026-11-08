import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AlertCircle, Boxes, Check, Download, ExternalLink, Eye, Loader2, Lock, Network, Puzzle, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { Button } from './components/ui'
import type { Host, PluginPage, PluginRecord, PluginRegistryEntry, PluginUpdate, RegistryMeta, Summary } from './types'
import { useT, type TranslationKey } from './i18n'

interface Marketplace {
  installed: PluginRecord[]
  registry: { generatedAt: string; plugins: PluginRegistryEntry[] } | null
  registryError: string
  pages: PluginPage[]
  audit: { at: string; action: string; id: string; version?: string; enabled?: boolean; key?: string }[]
  updates?: PluginUpdate[]
  registryMeta?: RegistryMeta
  settings: { developerPlugins: boolean; autoUpdateExtensions: boolean }
}

type Tab = 'installed' | 'discover' | 'builtin'
type KindFilter = 'all' | 'channel' | 'enhancement' | 'page'

function kindLabel(record: { kinds?: string[]; kind?: string }, t: (key: TranslationKey) => string): string {
  const kinds = record.kinds ?? []
  if (kinds.includes('channel') && kinds.includes('page')) return t('plKindChannelAndPage')
  if (kinds.includes('enhancement') && kinds.includes('page')) return t('plKindEnhancementAndPage')
  const map: Record<string, TranslationKey> = {
    channel: 'plKindChannel',
    enhancement: 'plKindEnhancement',
    page: 'plKindPage',
    bundle: 'plKindBundle',
  }
  const key = kinds[0] ?? record.kind ?? ''
  return map[key] ? t(map[key]) : t('plKindGeneric')
}

function kindOf(record: { kinds?: string[]; kind?: string; type?: string }): KindFilter {
  const kinds = record.kinds ?? []
  if (kinds.includes('channel')) return 'channel'
  if (kinds.includes('enhancement')) return 'enhancement'
  if (kinds.includes('page')) return 'page'
  const type = record.type ?? record.kind ?? ''
  return type === 'channel' || type === 'enhancement' || type === 'page' ? type : 'all'
}

function stateLabel(state: string, t: (key: TranslationKey) => string): string {
  const map: Record<string, TranslationKey> = {
    ready: 'plStateReady', starting: 'plStateStarting', stopped: 'plStateStopped',
    disabled: 'plStateDisabled', pending: 'plStatePending', failed: 'plStateFailed',
  }
  return map[state] ? t(map[state]) : state
}

function auditLabel(action: string, t: (key: TranslationKey) => string): string {
  const map: Record<string, TranslationKey> = {
    install: 'plAuditInstall', 'install-local': 'plAuditInstallLocal',
    uninstall: 'plAuditUninstall', 'set-enabled': 'plAuditSetEnabled',
    config: 'plAuditConfig', secret: 'plAuditSecret',
    'self-test': 'plAuditSelfTest', 'registry-refresh': 'plAuditRegistryRefresh',
    'auto-update': 'plAuditAutoUpdate',
  }
  return map[action] ? t(map[action]) : action
}

function permissionsText(record: { permissions?: { network?: string[]; secrets?: string[]; storage?: boolean } }, t: (key: TranslationKey) => string): string {
  const permissions = record.permissions ?? {}
  const parts = []
  if ((permissions.network ?? []).length > 0) parts.push(t('plNetDomainsCount').replace('{count}', String(permissions.network?.length)))
  if ((permissions.secrets ?? []).length > 0) parts.push(t('plSecretsCount').replace('{count}', String(permissions.secrets?.length)))
  if (permissions.storage === true) parts.push(t('plLocalStoragePerm'))
  return parts.length === 0 ? t('plNoExtraPermissions') : parts.join(' · ')
}

function permissionList(record: { permissions?: { network?: string[]; secrets?: string[]; storage?: boolean } }, t: (key: TranslationKey) => string): string[] {
  const permissions = record.permissions ?? {}
  const rows: string[] = []
  for (const origin of permissions.network ?? []) rows.push(t('plPermNetwork').replace('{origin}', origin))
  for (const key of permissions.secrets ?? []) rows.push(t('plPermSecret').replace('{key}', key))
  if (permissions.storage === true) rows.push(t('plPermStorage'))
  return rows
}

function defaultsOf(record: PluginRecord): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of record.config) values[field.key] = field.default
  return { ...values, ...record.values }
}

/** 签名市场的封面横幅。服务端按摘要校验字节；加载失败只是没有横幅，卡片照常。 */
function PluginCover({ id, kind }: { id: string; kind: string }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (failed) return null
  return <div className={`plugin-cover ${kind}${loaded ? ' loaded' : ''}`}>
    <img src={`/api/management/plugins/cover?id=${encodeURIComponent(id)}`} alt="" loading="lazy" decoding="async"
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
  </div>
}

function soakHint(update: PluginUpdate | undefined, t: (key: TranslationKey) => string): string {
  if (update === undefined) return ''
  if (update.ready) return t('plSoakReady')
  const hours = Math.max(1, Math.ceil(update.soakRemainingMs / 3_600_000))
  return t('plSoakRemaining').replace('{hours}', String(hours))
}

export function Plugins({ summary, host, active }: { summary: Summary; host: Host; active: boolean }) {
  const t = useT()
  const [data, setData] = useState<Marketplace>()
  const [tab, setTab] = useState<Tab>('installed')
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [installTarget, setInstallTarget] = useState<PluginRegistryEntry>()
  const [openConfig, setOpenConfig] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({})
  const [developerPath, setDeveloperPath] = useState('')
  const [developerAck, setDeveloperAck] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<{ done: number; total: number } | null>(null)

  const load = async (quiet = false) => {
    if (!quiet) setBusy(current => current === '' ? 'load' : current)
    try {
      const value = await host.request<Marketplace>('/plugins', undefined, 30_000)
      setData(value)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      if (!quiet) setBusy(current => current === 'load' ? '' : current)
    }
  }

  useEffect(() => { if (active) void load() }, [active])
  useEffect(() => { if (notice === '') return; const timer = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timer) }, [notice])

  const act = async (path: string, body: unknown, key: string) => {
    if (busy !== '') return
    setBusy(key)
    setError('')
    try {
      await host.request(path, body, 120_000)
      await load(true)
      await host.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      setBusy('')
    }
  }

  const needle = search.trim().toLowerCase()
  const matches = (record: { name?: string; id?: string; description?: string; summary?: string; author?: string; tags?: string[] }) =>
    needle === '' || [record.name, record.id, record.description, record.summary, record.author, ...(record.tags ?? [])]
      .some(value => String(value ?? '').toLowerCase().includes(needle))

  const installed = useMemo(() => (data?.installed ?? []).filter(record => record.builtin !== true && matches(record)), [data, needle])
  const builtins = useMemo(() => (data?.installed ?? []).filter(record => record.builtin === true && matches(record)), [data, needle])
  const registryRows = data?.registry?.plugins ?? []
  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = { all: registryRows.length, channel: 0, enhancement: 0, page: 0 }
    for (const entry of registryRows) counts[kindOf(entry)] += 1
    return counts
  }, [registryRows])
  const registry = useMemo(() => registryRows.filter(entry =>
    matches(entry) && (kindFilter === 'all' || kindOf(entry) === kindFilter)), [registryRows, needle, kindFilter])

  const updatesById = useMemo(() => new Map((data?.updates ?? []).map(update => [update.id, update])), [data])
  const registryMeta = data?.registryMeta
  const updateCandidates = useMemo(() => (data?.installed ?? [])
    .filter(record => record.builtin !== true)
    .filter(record => {
      const entry = registryRows.find(item => item.id === record.id)
      return entry !== undefined && entry.installed && entry.updateAvailable && entry.installable
    }), [data, registryRows])

  const openPluginPage = (record: PluginRecord, page: PluginRecord['pages'][number]) => {
    host.navigate(`plugin:${record.id}:${page.id}`)
  }

  const saveConfig = async (record: PluginRecord) => {
    const values = drafts[record.id] ?? defaultsOf(record)
    await act('/plugins/config', { id: record.id, values }, `config:${record.id}`)
    setOpenConfig('')
    setNotice(t('plConfigSaved'))
  }

  const saveSecret = async (record: PluginRecord, key: string) => {
    const value = secretDrafts[`${record.id}:${key}`] ?? ''
    await act('/plugins/secret', { id: record.id, key, value }, `secret:${record.id}:${key}`)
    setSecretDrafts(current => ({ ...current, [`${record.id}:${key}`]: '' }))
    setNotice(t('plSecretSaved'))
  }

  const selfTest = async (record: PluginRecord) => {
    if (busy !== '') return
    setBusy(`self:${record.id}`)
    try {
      const result = await host.request<{ ok: boolean; message: string }>('/plugins/self-test', { id: record.id }, 60_000)
      setNotice(result.ok ? `${t('plSelfTestPassed')}${result.message ? '：' + result.message : ''}` : t('plSelfTestFailed').replace('{message}', result.message))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      setBusy('')
    }
  }

  const installLocal = async () => {
    if (developerPath.trim() === '' || !developerAck) return
    await act('/plugins/install-local', { path: developerPath.trim(), acknowledgeUnsigned: true }, 'install-local')
    setDeveloperPath('')
    setDeveloperAck(false)
  }

  const toggleDeveloper = async () => {
    if (data === undefined || busy !== '') return
    setBusy('developer')
    try {
      await host.saveSettings({ developerPlugins: data.settings.developerPlugins !== true })
      await load(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      setBusy('')
    }
  }

  const toggleAutoUpdate = async () => {
    if (data === undefined || busy !== '') return
    setBusy('autoupdate')
    try {
      await host.saveSettings({ autoUpdateExtensions: data.settings.autoUpdateExtensions !== true })
      await load(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      setBusy('')
    }
  }

  const refreshRegistry = async () => {
    if (busy !== '') return
    setBusy('refresh')
    setError('')
    try {
      await host.request('/plugins/registry/refresh', {}, 60_000)
      await load(true)
      setNotice(t('plRegistryRefreshed'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      setBusy('')
    }
  }

  const exportShelf = () => {
    const installedAll = data?.installed ?? []
    if (installedAll.length === 0) { setNotice(t('plNoExportablePlugins')); return }
    const shelf = {
      version: 1,
      exportedAt: new Date().toISOString(),
      host: summary?.version ?? '',
      plugins: installedAll.filter(record => record.builtin !== true).map(record => ({
        id: record.id,
        version: record.version,
        enabled: record.enabled === true,
        config: record.values ?? {},
      })),
    }
    const blob = new Blob([JSON.stringify(shelf, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ofm-plugins-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice(t('plShelfExported'))
  }

  const importShelf = async (file: File) => {
    if (busy !== '') return
    let shelf: { plugins?: { id?: unknown; enabled?: unknown; config?: unknown }[] }
    try { shelf = JSON.parse(await file.text()) } catch { setError(t('plInvalidShelfJson')); return }
    const entries = Array.isArray(shelf?.plugins)
      ? shelf.plugins.filter(row => row !== null && typeof row === 'object' && typeof row.id === 'string')
      : []
    if (entries.length === 0) { setError(t('plNoInstallableInShelf')); return }
    setBusy('import')
    setError('')
    let restored = 0
    let failed = 0
    try {
      for (const entry of entries) {
        try {
          await host.request('/plugins/install', { id: entry.id }, 120_000)
          if (entry.config !== null && typeof entry.config === 'object' && !Array.isArray(entry.config)) {
            await host.request('/plugins/config', { id: entry.id, values: entry.config }, 30_000)
          }
          if (entry.enabled === true) await host.request('/plugins/toggle', { id: entry.id, enabled: true }, 60_000)
          restored += 1
        } catch {
          failed += 1
        }
      }
      await load(true)
      await host.refresh()
      setNotice(`${t('plRestoredPlugins').replace('{restored}', String(restored))}${failed > 0 ? t('plRestoredFailed').replace('{failed}', String(failed)) : ''}`)
    } finally {
      setBusy('')
    }
  }

  const updateAll = async () => {
    if (busy !== '' || updateCandidates.length === 0) return
    setBusy('update-all')
    setError('')
    setUpdateProgress({ done: 0, total: updateCandidates.length })
    let failed = 0
    try {
      let done = 0
      for (const record of updateCandidates) {
        try {
          await host.request('/plugins/install', { id: record.id }, 120_000)
        } catch {
          failed += 1
        }
        done += 1
        setUpdateProgress({ done, total: updateCandidates.length })
      }
      await load(true)
      setNotice(`${t('plUpdatedPlugins').replace('{count}', String(updateCandidates.length - failed))}${failed > 0 ? t('plUpdatedFailed').replace('{failed}', String(failed)) : ''}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('errRequestFailed'))
    } finally {
      setBusy('')
      setUpdateProgress(null)
    }
  }

  const renderConfig = (record: PluginRecord) => {
    const values = drafts[record.id] ?? defaultsOf(record)
    const set = (key: string, value: unknown) => setDrafts(current => ({ ...current, [record.id]: { ...values, [key]: value } }))
    return <div className="plugin-config">
      {record.config.length === 0 && <p className="plugin-muted">{t('plNoConfig')}</p>}
      {record.config.map(field => <label className="plugin-field" key={field.key}>
        <span>{field.label}{field.description ? <small>{field.description}</small> : null}</span>
        {field.type === 'toggle'
          ? <input type="checkbox" checked={values[field.key] === true} onChange={event => set(field.key, event.target.checked)} />
          : field.type === 'select'
            ? <select value={String(values[field.key] ?? '')} onChange={event => set(field.key, event.target.value)}>
              {(field.options ?? []).map(option => <option value={option} key={option}>{option}</option>)}
            </select>
            : <input type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
              value={String(values[field.key] ?? '')} onChange={event => set(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)} />}
      </label>)}
      <div className="plugin-actions"><Button onClick={() => { void saveConfig(record) }} disabled={busy !== ''}>{busy === `config:${record.id}` ? t('plSavingConfig') : t('plSaveConfig')}</Button>
        <Button variant="ghost" onClick={() => setOpenConfig('')}>{t('plCollapse')}</Button></div>
    </div>
  }

  const renderSecrets = (record: PluginRecord) => record.secrets.length === 0 ? null : <div className="plugin-secrets">
    {record.secrets.map(secret => <label className="plugin-field" key={secret.key}>
      <span>{secret.key}<small>{secret.hasValue ? t('plSavedSecret').replace('{hint}', secret.hint) : t('plNotSetSecret')}</small></span>
      <div className="plugin-secret-row">
        <input type="password" autoComplete="off" placeholder={secret.hasValue ? t('plSecretReplacePlaceholder') : t('plSecretEnterPlaceholder')}
          value={secretDrafts[`${record.id}:${secret.key}`] ?? ''}
          onChange={event => setSecretDrafts(current => ({ ...current, [`${record.id}:${secret.key}`]: event.target.value }))} />
        <Button onClick={() => { void saveSecret(record, secret.key) }} disabled={busy !== ''}>{t('plSaveSecret')}</Button>
      </div>
    </label>)}
  </div>

  const renderInstalledCard = (record: PluginRecord, index: number) => {
    const update = data?.registry?.plugins.find(entry => entry.id === record.id)
    const pages = record.pages ?? []
    const kind = kindOf(record)
    return <article className={`plugin-card kind-${kind}`} key={record.id} style={{ '--i': String(index) } as CSSProperties}>
      {update?.cover !== undefined && <PluginCover id={record.id} kind={kind} />}
      <header>
        <span className="plugin-icon"><Puzzle size={18} /></span>
        <div className="plugin-title"><strong>{record.name}</strong>
          <span className="plugin-sub">{record.id} · v{record.version} · {kindLabel(record, t)}</span>
        </div>
        <span className={`plugin-state ${record.state}`}>{record.builtin ? t('plBuiltin') : stateLabel(record.state, t)}</span>
      </header>
      {record.description && <p className="plugin-description">{record.description}</p>}
      <div className="plugin-meta">
        <span>{permissionsText(record, t)}</span>
        {record.modelCount !== undefined && <span>{t('plModelsCount').replace('{count}', String(record.modelCount))}</span>}
        {record.pageCount > 0 && <span>{t('plPagesCount').replace('{count}', String(record.pageCount))}</span>}
        {record.source === 'local' && <span className="plugin-badge warning">{t('plDevPackage')}</span>}
        {record.verified === false && <span className="plugin-badge warning">{t('plUnverified')}</span>}
      </div>
      {record.error && <p className="plugin-error"><AlertCircle size={14} />{record.error}</p>}
      <div className="plugin-actions">
        {pages.map(page => <Button key={page.id} onClick={() => openPluginPage(record, page)}><ExternalLink size={14} />{t('plOpenPage').replace('{title}', page.title)}</Button>)}
        {!record.builtin && <Button variant={record.enabled ? 'ghost' : 'default'} onClick={() => { void act('/plugins/toggle', { id: record.id, enabled: !record.enabled }, `toggle:${record.id}`) }} disabled={busy !== ''}>
          {record.enabled ? t('plDisable') : t('plEnable')}
        </Button>}
        {record.config.length > 0 && <Button variant="ghost" onClick={() => setOpenConfig(openConfig === record.id ? '' : record.id)}>{openConfig === record.id ? t('plCollapseConfig') : t('plConfig')}</Button>}
        {record.selfTestAvailable && <Button variant="ghost" onClick={() => { void selfTest(record) }} disabled={busy !== ''}>{busy === `self:${record.id}` ? t('plSelfTesting') : t('plSelfTest')}</Button>}
        {update?.updateAvailable && update.installable && <Button onClick={() => setInstallTarget(update)}>{t('plUpdateTo').replace('{version}', update.version)}</Button>}
        {update?.updateAvailable && <p className="plugin-soak">{(update.changelog ?? [])[0] ?? ''}{(update.changelog ?? []).length > 0 ? ' · ' : ''}{soakHint(updatesById.get(record.id), t)}</p>}
        {!record.builtin && <Button variant="ghost" className="danger" onClick={() => { if (window.confirm(t('plUninstallConfirm').replace('{name}', record.name))) void act('/plugins/uninstall', { id: record.id }, `uninstall:${record.id}`) }} disabled={busy !== ''}>
          <Trash2 size={14} />{t('plUninstall')}
        </Button>}
      </div>
      {openConfig === record.id && renderConfig(record)}
      {renderSecrets(record)}
    </article>
  }

  const renderRegistryCard = (entry: PluginRegistryEntry, index: number) => {
    const kind = kindOf(entry)
    return <article className={`plugin-card kind-${kind}`} key={entry.id} style={{ '--i': String(index) } as CSSProperties}>
      {entry.cover !== undefined && <PluginCover id={entry.id} kind={kind} />}
      <header>
        <span className="plugin-icon"><Puzzle size={18} /></span>
        <div className="plugin-title"><strong>{entry.name}</strong>
          <span className="plugin-sub">{entry.id} · v{entry.version} · {kindLabel(entry, t)}</span>
        </div>
        {entry.installed && <span className="plugin-state ready">{entry.updateAvailable ? t('plCanUpdate') : t('plInstalled')}</span>}
      </header>
      {entry.summary && <p className="plugin-description">{entry.summary}</p>}
      <div className="plugin-meta">
        <span>{permissionsText(entry, t)}</span>
        {entry.pages.length > 0 && <span>{t('plPagesCount').replace('{count}', String(entry.pages.length))}</span>}
        {entry.author && <button type="button" className="plugin-meta-btn" onClick={() => { setTab('discover'); setSearch(entry.author ?? '') }}>{entry.author}</button>}
        {(entry.tags ?? []).slice(0, 3).map(tag => <button type="button" className="plugin-tag" key={tag} onClick={() => { setTab('discover'); setSearch(tag) }}>{tag}</button>)}
      </div>
      <div className="plugin-actions">
        {!entry.installed && <Button onClick={() => setInstallTarget(entry)} disabled={!entry.installable || busy !== ''}>{entry.installable ? <><Download size={14} />{t('plInstall')}</> : t('plIncompatible')}</Button>}
        {entry.installed && entry.updateAvailable && <Button onClick={() => setInstallTarget(entry)} disabled={!entry.installable || busy !== ''}>{t('plUpdateTo').replace('{version}', entry.version)}</Button>}
        {entry.installed && !entry.updateAvailable && <span className="plugin-muted"><Check size={14} />{t('plUpToDate')}</span>}
      </div>
    </article>
  }

  const renderBuiltinCard = (record: PluginRecord, index: number) => <article className="plugin-card builtin" key={record.id} style={{ '--i': String(index) } as CSSProperties}>
    <header>
      <span className="plugin-icon"><Boxes size={18} /></span>
      <div className="plugin-title"><strong>{record.name}</strong><span className="plugin-sub">{record.id} · {kindLabel(record, t)}</span></div>
      <span className="plugin-state ready">{t('plBuiltin')}</span>
    </header>
    {record.description && <p className="plugin-description">{record.description}</p>}
    <div className="plugin-meta">
      {record.modelCount !== undefined && record.modelCount > 0 && <span>{t('plContributionsCount').replace('{count}', String(record.modelCount))}</span>}
      <span>{record.provides?.join(' · ') || t('plKernelComponent')}</span>
    </div>
  </article>

  const skeleton = (count = 6) => <div className="plugin-grid" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div className="plugin-skel" key={index} style={{ '--i': String(index) } as CSSProperties}>
      <i style={{ width: '44%' }} /><i style={{ width: '72%' }} /><i style={{ width: '88%' }} /><i style={{ width: '56%' }} />
    </div>)}
  </div>

  const clearFilters = () => { setSearch(''); setKindFilter('all') }
  const filtersActive = needle !== '' || kindFilter !== 'all'

  return <section className="plugins-page" data-testid="plugins-page">
    <header className="plugins-header">
      <div><span className="eyebrow">PLUGIN CENTER</span><h1>{t('plTitle')}</h1>
        <p>{t('plSubtitle')}</p></div>
      <div className="plugin-actions">
        <Button variant="ghost" onClick={() => void load()} disabled={busy !== ''}><RefreshCw size={14} />{t('plRefresh')}</Button>
        <Button variant="ghost" onClick={() => void refreshRegistry()} disabled={busy !== ''}>{busy === 'refresh' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}{t('plRefreshRegistry')}</Button>
        <label className="plugin-import" title={t('plImportShelfTitle')}>
          <input type="file" accept="application/json,.json" disabled={busy !== ''} hidden
            onChange={event => { const file = event.target.files?.[0]; if (file !== undefined) void importShelf(file); event.target.value = '' }} />
          <Upload size={14} />{t('plImportShelf')}
        </label>
        <Button variant="ghost" onClick={exportShelf} disabled={busy !== ''} title={t('plExportShelfTitle')}><Download size={14} />{t('plExportShelf')}</Button>
        <Button onClick={() => void updateAll()} disabled={busy !== '' || updateProgress !== null || updateCandidates.length === 0} title={updateCandidates.length === 0 ? t('plNoUpdates') : undefined}>
          {updateProgress !== null ? t('plUpdating').replace('{done}', String(updateProgress.done)).replace('{total}', String(updateProgress.total)) : `${t('plUpdateAll')}${updateCandidates.length > 0 ? ` (${updateCandidates.length})` : ''}`}
        </Button>
      </div>
      <div className="plugins-subrow">
        <label className="plugin-switch" title={t('plAutoUpdateTitle')}>
          <input type="checkbox" checked={data?.settings.autoUpdateExtensions === true} onChange={() => void toggleAutoUpdate()} disabled={busy !== ''} /><span>{t('plAutoUpdate')}</span>
        </label>
        {registryMeta?.source ? <span className="plugin-source" title={`Source: ${registryMeta.source} · Generated: ${registryMeta.generatedAt || '—'}`}>
          {t('plIndexSource').replace('{source}', registryMeta.source === 'bundled' ? t('plBundledSnapshot') : (() => { try { return new URL(registryMeta.source).hostname } catch { return registryMeta.source } })())}
        </span> : null}
      </div>
    </header>

    {error && <div className="notice error-notice" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
    {notice && <div className="notice" role="status">{notice}<button className="text-button" onClick={() => setNotice('')}>{t('cxClose')}</button></div>}
    {data?.registryError && <div className="notice" role="status"><ShieldAlert size={16} /><span>{t('plRegistryOffline').replace('{error}', data.registryError)}</span></div>}

    <div className="plugins-toolbar">
      <div className="plugin-tabs" role="tablist">
        {([['installed', t('plTabInstalled').replace('{count}', String(installed.length))], ['discover', t('plTabDiscover')], ['builtin', t('plTabBuiltin').replace('{count}', String(builtins.length))]] as [Tab, string][]).map(([id, label]) =>
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <label className="plugin-search"><Search size={15} /><input type="search" placeholder={t('plSearchPlaceholder')} value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>

    {tab === 'discover' && <div className="plugin-kindbar" role="group" aria-label={t('libTypeFilterAria')}>
      {([['all', t('plFilterAll')], ['channel', t('plFilterChannel')], ['enhancement', t('plFilterEnhancement')], ['page', t('plFilterPage')]] as [KindFilter, string][]).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={kindFilter === id} className={kindFilter === id ? 'selected' : ''}
          onClick={() => setKindFilter(id)}>{label}<span className="plugin-kindcount">{kindCounts[id]}</span></button>)}
      {filtersActive && <button type="button" className="plugin-clear" onClick={clearFilters}><X size={13} />{t('plClearFilters')}</button>}
    </div>}

    {data === undefined ? skeleton()
      : tab === 'installed' && <div className="plugin-grid">
        {installed.length === 0
          ? <p className="plugin-empty">{filtersActive ? <>{t('plEmptyInstalledNoMatch')}<button className="text-button" onClick={clearFilters}>{t('plClearFilters')}</button></> : t('plEmptyInstalledHint')}</p>
          : installed.map(renderInstalledCard)}
      </div>}
    {data !== undefined && tab === 'discover' && <div className="plugin-grid">
      {registry.length === 0
        ? <p className="plugin-empty">{filtersActive ? <>{t('plEmptyInstalledNoMatch')}<button className="text-button" onClick={clearFilters}>{t('plClearFilters')}</button></> : t('plEmptyRegistry')}</p>
        : registry.map(renderRegistryCard)}
    </div>}
    {data !== undefined && tab === 'builtin' && <div className="plugin-grid">
      {builtins.length === 0 ? <p className="plugin-empty">{t('plEmptyBuiltin')}</p> : builtins.map(renderBuiltinCard)}
    </div>}

    <section className="plugin-developer">
      <header><div><h2>{t('plDevModeTitle')}</h2><p>{t('plDevModeDesc')}</p></div>
        <label className="plugin-switch"><input type="checkbox" checked={data?.settings.developerPlugins === true} onChange={() => void toggleDeveloper()} disabled={busy !== ''} /><span>{t('plAllowUnsigned')}</span></label>
      </header>
      {data?.settings.developerPlugins === true && <div className="plugin-developer-form">
        <label className="plugin-field"><span>{t('plPluginDir')}<small>{t('plPluginDirHint')}</small></span>
          <input type="text" placeholder="D:\\plugins\\my-plugin" value={developerPath} onChange={event => setDeveloperPath(event.target.value)} /></label>
        <label className="plugin-check"><input type="checkbox" checked={developerAck} onChange={event => setDeveloperAck(event.target.checked)} /><span>{t('plDeveloperAck')}</span></label>
        <Button onClick={() => void installLocal()} disabled={busy !== '' || developerPath.trim() === '' || !developerAck}><Upload size={14} />{t('plInstallLocal')}</Button>
      </div>}
    </section>

    <section className="plugin-audit">
      <h2>{t('plRecentAudit')}</h2>
      {data === undefined || data.audit.length === 0 ? <p className="plugin-muted">{t('plNoAuditRecords')}</p> : <ul>{data.audit.slice().reverse().slice(0, 20).map((entry, index) =>
        <li key={`${entry.at}-${index}`}><span>{new Date(entry.at).toLocaleString()}</span><strong>{auditLabel(entry.action, t)}</strong><code>{entry.id}</code>{entry.version && <span>v{entry.version}</span>}{entry.enabled !== undefined && <span>{entry.enabled ? t('plEnable') : t('plDisable')}</span>}</li>)}</ul>}
    </section>

    {installTarget !== undefined && <div className="plugin-modal-backdrop" role="presentation" onClick={() => setInstallTarget(undefined)}>
      <div className="plugin-modal" role="dialog" aria-modal="true" aria-label={t('plModalInstall')} onClick={event => event.stopPropagation()}>
        <header><h2>{(installTarget.installed ? t('plModalUpdate') : t('plModalInstall'))} {installTarget.name}</h2><button className="text-button" onClick={() => setInstallTarget(undefined)} aria-label={t('cxClose')}><X size={16} /></button></header>
        <div className="plugin-modal-band">
          <span className={`plugin-kindchip kind-${kindOf(installTarget)}`}>{kindLabel(installTarget, t)}</span>
          {installTarget.cover !== undefined && <img className="plugin-modal-cover" src={`/api/management/plugins/cover?id=${encodeURIComponent(installTarget.id)}`} alt="" />}
        </div>
        <p className="plugin-sub">{installTarget.id} · v{installTarget.version} · {installTarget.author || t('plUnknownAuthor')}</p>
        {installTarget.summary && <p>{installTarget.summary}</p>}
        {(installTarget.tags ?? []).length > 0 && <div className="plugin-meta">{(installTarget.tags ?? []).map(tag => <span className="plugin-tag" key={tag}>{tag}</span>)}</div>}
        <div className="plugin-modal-facts">
          {installTarget.license && <span><ShieldCheck size={13} />{installTarget.license}</span>}
          {typeof installTarget.publishedAt === 'string' && installTarget.publishedAt !== '' && <span><Eye size={13} />{t('plPublishedAt').replace('{date}', new Date(installTarget.publishedAt).toLocaleDateString())}</span>}
          {(installTarget.models?.length ?? 0) > 0 && <span><Puzzle size={13} />{t('plModelsCount').replace('{count}', String(installTarget.models?.length))}</span>}
          {installTarget.pages.length > 0 && <span><ExternalLink size={13} />{t('plPagesCount').replace('{count}', String(installTarget.pages.length))}</span>}
        </div>
        {(installTarget.models ?? []).length > 0 && <div className="plugin-models">
          {installTarget.models?.slice(0, 12).map(model => <span className="plugin-model" key={model.id} title={model.id}>{model.name ?? model.id}</span>)}
          {(installTarget.models?.length ?? 0) > 12 && <span className="plugin-muted">+{installTarget.models!.length - 12}</span>}
        </div>}
        <div className="plugin-permissions">
          <strong>{t('plPermissionsHeading')}</strong>
          {permissionList(installTarget, t).length === 0 ? <p className="plugin-muted"><ShieldCheck size={14} />{t('plNoExtraPermissions')}</p> : <ul>{permissionList(installTarget, t).map(row => <li key={row}>{row.startsWith('网络') || row.startsWith('Network') ? <Network size={12} /> : row.startsWith('密钥') || row.startsWith('Secret') ? <Lock size={12} /> : null}{row}</li>)}</ul>}
        </div>
        {(installTarget.changelog ?? []).length > 0 && <div className="plugin-changelog">
          <strong>{t('plChangelogHeading')}</strong>
          <ul>{installTarget.changelog?.map((row, index) => <li key={index} className={index === 0 ? 'latest' : ''}>{row}</li>)}</ul>
        </div>}
        <p className="plugin-muted">{t('plVerifyNote')}</p>
        {(installTarget.homepage || installTarget.repository || installTarget.sourceUrl) && <div className="plugin-actions">
          {installTarget.sourceUrl && <a className="plugin-link" href={installTarget.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{t('plViewSource')}</a>}
          {installTarget.homepage && <a className="plugin-link" href={installTarget.homepage} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{t('plHomepage')}</a>}
          {installTarget.repository && <a className="plugin-link" href={installTarget.repository} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{t('plSourceRepo')}</a>}
        </div>}
        <div className="plugin-actions"><Button onClick={() => { void act('/plugins/install', { id: installTarget.id }, `install:${installTarget.id}`).then(() => setInstallTarget(undefined)) }} disabled={busy !== ''}>
          {busy.startsWith('install:') ? <Loader2 className="spin" size={14} /> : <Download size={14} />}{installTarget.installed ? t('plConfirmUpdate') : t('plConfirmInstall')}
        </Button><Button variant="ghost" onClick={() => setInstallTarget(undefined)}>{t('pdCancel')}</Button></div>
      </div>
    </div>}
  </section>
}
