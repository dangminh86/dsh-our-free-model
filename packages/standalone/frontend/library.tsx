import { useEffect, useRef, useState } from 'react'
import { Blocks, Check, ChevronDown, ChevronUp, CircleAlert, FileText, Layers3, Pencil, Play, Plus, RefreshCw, Save, Search, Terminal, Trash2, Users, WandSparkles } from 'lucide-react'
import { Badge, Button, Input, Switch } from './components/ui'
import { WorkbenchDialog } from './components/workbench-dialog'
import { failureMessage, management, useManagementResource } from './management'
import { useT, useLocale } from './i18n'

type ResourceKind = 'mcp' | 'prompt' | 'skill' | 'agent'
interface Resource { id: string; kind: ResourceKind; name: string; content: string; enabled: boolean }
interface ProfileClient { id: string; mode: 'gateway' | 'native'; model: string; cwd: string; executable: string }
interface Profile { id: string; name: string; clients: ProfileClient[] }
interface LibraryData { profiles: Profile[]; resources: Resource[] }

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validName = (value: string) => !!value && value.length <= 80 && !/[\x00-\x1f\x7f<>:"/\\|?*]/.test(value)
  && !value.endsWith('.') && !value.includes('..') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
  && !['__proto__', 'prototype', 'constructor'].includes(value)

function validateMcp(content: string, name: string, isEn = false) {
  let value: unknown
  try { value = JSON.parse(content) } catch { throw new Error(isEn ? 'MCP content must be valid JSON.' : 'MCP 内容必须是有效的 JSON。') }
  if (!isObject(value)) throw new Error(isEn ? 'MCP content must be a JSON object.' : 'MCP 内容必须是 JSON 对象。')
  const wrapped = Object.hasOwn(value, 'mcpServers')
  if (wrapped && (Object.keys(value).length !== 1 || !isObject(value.mcpServers))) {
    throw new Error(isEn ? 'mcpServers must be an object of server names and configs.' : 'mcpServers 必须是服务名称与配置组成的对象。')
  }
  const servers = wrapped ? Object.entries(value.mcpServers as Record<string, unknown>) : [[name, value] as const]
  if (!servers.length || servers.length > 64) throw new Error(isEn ? 'MCP resource must contain 1 to 64 servers.' : 'MCP 资源需要包含 1 至 64 个服务。')
  for (const [serverName, server] of servers) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(serverName) || !validName(serverName)) {
      throw new Error(isEn ? 'MCP server name must be 1-64 alphanumeric characters, underscores, hyphens, or dots.' : 'MCP 服务名称须为 1 至 64 位字母、数字、下划线、连字符或点。')
    }
    if (!isObject(server)) throw new Error(isEn ? 'Each MCP server config must be an object.' : '每个 MCP 服务配置必须是对象。')
    if (Object.keys(server).some(key => !['type', 'command', 'args', 'env', 'cwd', 'url', 'httpUrl', 'headers'].includes(key))) {
      throw new Error(isEn ? 'MCP config contains unsupported fields.' : 'MCP 配置含有不支持的字段。')
    }
    const stdio = Object.hasOwn(server, 'command')
    const remote = Object.hasOwn(server, 'url') || Object.hasOwn(server, 'httpUrl')
    if (stdio === remote || (Object.hasOwn(server, 'url') && Object.hasOwn(server, 'httpUrl'))) {
      throw new Error(isEn ? 'MCP must use either command or HTTP URL.' : 'MCP 须选择 command 或 HTTP 地址中的一种。')
    }
    if (stdio) {
      if (typeof server.command !== 'string' || !server.command.trim()) throw new Error(isEn ? 'MCP command cannot be empty.' : 'MCP command 不能为空。')
      if (server.type !== undefined && server.type !== 'stdio') throw new Error(isEn ? 'Command-based MCP type must be stdio.' : '命令型 MCP 的 type 必须是 stdio。')
      if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some(arg => typeof arg !== 'string'))) {
        throw new Error(isEn ? 'MCP args must be an array of strings.' : 'MCP args 必须是字符串数组。')
      }
      if (Object.hasOwn(server, 'headers')) throw new Error(isEn ? 'MCP headers are only applicable to HTTP services.' : 'MCP headers 仅适用于 HTTP 服务。')
    } else {
      if (['args', 'env', 'cwd'].some(key => Object.hasOwn(server, key))) throw new Error(isEn ? 'HTTP MCP does not accept args, env, or cwd.' : 'HTTP MCP 不接受 args、env 或 cwd。')
      if (server.type !== undefined && !['http', 'streamable-http', 'sse'].includes(String(server.type))) throw new Error(isEn ? 'Invalid HTTP MCP type.' : 'HTTP MCP 的 type 无效。')
      try {
        const url = new URL(String(server.httpUrl ?? server.url))
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error()
      } catch { throw new Error(isEn ? 'MCP URL must be an HTTP(S) address without username, password, or hash.' : 'MCP URL 须为不含用户名、密码和片段的 HTTP(S) 地址。') }
    }
    for (const field of ['env', 'headers']) {
      if (server[field] !== undefined && (!isObject(server[field]) || Object.values(server[field]).some(item => typeof item !== 'string'))) {
        throw new Error(isEn ? `MCP ${field} must be a string key-value object.` : `MCP ${field} 必须是字符串键值对象。`)
      }
    }
  }
}

function ResourceEditor({ resource, onClose, onSaved }: { resource?: Resource; onClose(): void; onSaved(): Promise<void> }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'

  const kinds = [
    { id: 'mcp', name: 'MCP', icon: Blocks },
    { id: 'prompt', name: t('libPrompt'), icon: FileText },
    { id: 'skill', name: t('libSkill'), icon: WandSparkles },
    { id: 'agent', name: t('libAgent'), icon: Users },
  ] as const

  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? 'mcp')
  const [name, setName] = useState(resource?.name ?? '')
  const [content, setContent] = useState(resource?.content ?? '')
  const [enabled, setEnabled] = useState(resource?.enabled ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])
  const submit = async () => {
    if (lock.current) return
    setError('')
    const trimmedName = name.trim()
    try {
      if (!validName(trimmedName)) throw new Error(t('libErrName'))
      if (!content.trim()) throw new Error(t('libErrContent'))
      if (new TextEncoder().encode(content).byteLength > 1024 * 1024) throw new Error(t('libErrContentTooLarge'))
      if (kind === 'mcp') validateMcp(content, trimmedName, isEn)
      lock.current = true; setBusy(true)
      await management('/library/resources/save', { ...(resource ? { id: resource.id } : {}), kind, name: trimmedName, content, enabled })
      if (!live.current) return
      await onSaved()
      if (live.current) onClose()
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { lock.current = false; if (live.current) setBusy(false) }
  }
  return <WorkbenchDialog title={resource ? t('libEditResourceTitle') : t('libNewResourceTitle')} busy={busy} onClose={onClose}>
    <form className="wb-form lib-editor" onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="wb-form-grid">
        <label>{t('libResourceName')}<Input autoFocus required maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <label>{t('libResourceType')}<select aria-label={t('libResourceType')} value={kind} disabled={busy} onChange={event => setKind(event.target.value as ResourceKind)}>{kinds.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
      </div>
      <label>{kind === 'mcp' ? t('libMcpConfigJson') : t('libMarkdownContent')}
        <textarea aria-label={kind === 'mcp' ? t('libMcpConfigJson') : t('libMarkdownContent')} className="lib-content" rows={12} spellCheck={false} autoComplete="off" required value={content} disabled={busy}
          placeholder={kind === 'mcp' ? '{\n  "command": "npx",\n  "args": [],\n  "env": {}\n}' : ''} onChange={event => setContent(event.target.value)} /></label>
      <div className="wb-form-switch"><span>{t('libEnableResource')}</span><Switch checked={enabled} disabled={busy} aria-label={t('libEnableResource')} onCheckedChange={setEnabled} /></div>
      {error && <p className="wb-error" role="alert"><CircleAlert size={15} />{error}</p>}
      <div className="wb-form-actions"><Button variant="outline" disabled={busy} onClick={onClose}>{t('pdCancel')}</Button><Button type="submit" busy={busy}><Save size={15} />{t('libSaveResource')}</Button></div>
    </form>
  </WorkbenchDialog>
}

function ProfileEditor({ onClose, onSaved }: { onClose(): void; onSaved(): Promise<void> }) {
  const t = useT()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])
  const submit = async () => {
    if (lock.current) return
    setError('')
    if (!validName(name.trim())) { setError(t('libErrProfileName')); return }
    lock.current = true; setBusy(true)
    try {
      await management('/library/profiles/save', { name: name.trim() })
      if (!live.current) return
      await onSaved()
      if (live.current) onClose()
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { lock.current = false; if (live.current) setBusy(false) }
  }
  return <WorkbenchDialog title={t('libSaveProfileTitle')} onClose={onClose} busy={busy}>
    <form className="wb-form" onSubmit={event => { event.preventDefault(); void submit() }}>
      <label>{t('libProfileName')}<Input autoFocus required maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      {error && <p className="wb-error" role="alert"><CircleAlert size={15} />{error}</p>}
      <div className="wb-form-actions"><Button variant="outline" disabled={busy} onClick={onClose}>{t('pdCancel')}</Button><Button type="submit" busy={busy}><Save size={15} />{t('libSaveProfile')}</Button></div>
    </form>
  </WorkbenchDialog>
}

export function Library({ active }: { active: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const isEn = locale === 'en'

  const kinds = [
    { id: 'mcp', name: 'MCP', icon: Blocks },
    { id: 'prompt', name: t('libPrompt'), icon: FileText },
    { id: 'skill', name: t('libSkill'), icon: WandSparkles },
    { id: 'agent', name: t('libAgent'), icon: Users },
  ] as const

  const { data, error: loadError, loading, reload } = useManagementResource<LibraryData>('/library', active)
  const [tab, setTab] = useState<'resources' | 'profiles'>('resources')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [editor, setEditor] = useState<Resource | 'new'>()
  const [profileEditor, setProfileEditor] = useState(false)
  const [expanded, setExpanded] = useState('')
  const [removing, setRemoving] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const live = useRef(true)
  const lock = useRef(false)
  useEffect(() => () => { live.current = false }, [])
  const resources = data?.resources ?? [], profiles = data?.profiles ?? []
  const visibleResources = resources.filter(row => (kind === 'all' || row.kind === kind) && row.name.toLowerCase().includes(search.trim().toLowerCase()))
  const visibleProfiles = profiles.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase()))
  const blocked = !!busy || loading || !!editor || profileEditor
  const run = async (path: string, body: object, id: string, message: string) => {
    if (lock.current) return
    lock.current = true; setBusy(id); setError(''); setStatus('')
    try {
      const result = await management<{ ok?: boolean; clients?: ProfileClient[] }>(path, body)
      if (!live.current) return
      setStatus(path.endsWith('/apply')
        ? result.ok === true ? `${t('libProfileApplied')}${Array.isArray(result.clients) ? t('libProfileAppliedCount').replace('{count}', String(result.clients.length)) : ''}。` : t('libProfileAppliedNoResult')
        : message)
      setRemoving('')
      await reload()
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { lock.current = false; if (live.current) setBusy('') }
  }
  const selectTab = (next: typeof tab) => { setTab(next); setSearch(''); setRemoving(''); setError(''); setStatus('') }
  const saved = async (message: string) => { await reload(); if (live.current) { setStatus(message); setError('') } }
  return <div className="wb-page lib-page">
    <header className="wb-heading"><div><span className="wb-eyebrow">LIBRARY</span><h1>{t('libTitle')}</h1></div>
      <Button variant="outline" aria-label={t('libRefresh')} title={t('libRefresh')} busy={loading} disabled={blocked} onClick={() => void reload()}><RefreshCw size={15} />{t('libRefresh')}</Button></header>
    <div className="lib-tabs" role="tablist" aria-label={t('libViewAria')}>
      {([['resources', t('libTabResources'), resources.length], ['profiles', t('libTabProfiles'), profiles.length]] as const).map(([id, name, count]) =>
        <button key={id} type="button" role="tab" id={`lib-tab-${id}`} aria-controls={`lib-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
          onClick={() => selectTab(id)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 'resources' : event.key === 'End' ? 'profiles' : tab === 'resources' ? 'profiles' : 'resources'
            selectTab(next); document.getElementById(`lib-tab-${next}`)?.focus()
          }}>{name}<span>{data ? count : '—'}</span></button>)}
    </div>
    <div className="wb-toolbar lib-toolbar">
      <label className="wb-search"><Search size={16} /><Input aria-label={tab === 'resources' ? t('libSearchResources') : t('libSearchProfiles')} placeholder={tab === 'resources' ? t('libSearchResources') : t('libSearchProfiles')} value={search} onChange={event => setSearch(event.target.value)} /></label>
      {tab === 'resources' && <select aria-label={t('libTypeFilterAria')} value={kind} onChange={event => setKind(event.target.value)}><option value="all">{t('libAllTypes')}</option>{kinds.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select>}
      <Button className="lib-create" disabled={blocked || !data} onClick={() => { setError(''); setStatus(''); if (tab === 'resources') setEditor('new'); else setProfileEditor(true) }}>
        {tab === 'resources' ? <Plus size={15} /> : <Save size={15} />}{tab === 'resources' ? t('libCreateResource') : t('libSaveCurrentProfile')}</Button>
    </div>
    {(error || loadError) && <div className="wb-feedback wb-error" role="alert"><CircleAlert size={16} /><span>{error || loadError}</span>{loadError && <Button variant="outline" disabled={blocked} onClick={() => void reload()}>{t('btnRetry')}</Button>}</div>}
    {status && <div className="wb-feedback wb-status" role="status"><Check size={16} /><span>{status}</span></div>}
    <section className="lib-list" role="tabpanel" id={`lib-panel-${tab}`} aria-labelledby={`lib-tab-${tab}`} aria-busy={loading}>
      {tab === 'resources' ? visibleResources.map(resource => {
        const type = kinds.find(row => row.id === resource.kind) ?? kinds[0]
        return <div className="lib-resource" key={resource.id}>
          <div className="lib-resource-row">
            <span className={`wb-app-icon ${resource.kind === 'skill' || resource.kind === 'agent' ? 'is-green' : ''}`}><type.icon size={20} /></span>
            <div className="lib-name"><strong>{resource.name}</strong><small>{t('libBytes').replace('{bytes}', new TextEncoder().encode(resource.content).byteLength.toLocaleString(isEn ? 'en-US' : 'zh-CN'))}</small></div>
            <Badge>{type.name}</Badge><Switch checked={resource.enabled} disabled={blocked} aria-label={t('libEnableResourceAria').replace('{name}', resource.name)}
              onCheckedChange={enabled => void run('/library/resources/save', { ...resource, enabled }, resource.id, enabled ? t('libResourceEnabled') : t('libResourceDisabled'))} />
            <div className="lib-actions"><Button variant="ghost" aria-label={t('libEditResourceAria').replace('{name}', resource.name)} title={t('libEditResource')} disabled={blocked} onClick={() => setEditor(resource)}><Pencil size={15} /></Button>
              <Button variant="ghost" className="wb-danger" aria-label={t('libDeleteResourceAria').replace('{name}', resource.name)} title={t('pdConfirmRemove')} disabled={blocked} onClick={() => setRemoving(resource.id)}><Trash2 size={15} /></Button></div>
          </div>
          {removing === resource.id && <div className="wb-remove lib-confirm"><span>{t('libDeleteResourceConfirm').replace('{name}', resource.name)}</span><Button variant="outline" disabled={!!busy} onClick={() => setRemoving('')}>{t('pdCancel')}</Button>
            <Button variant="outline" className="wb-danger" busy={busy === resource.id} disabled={!!busy} onClick={() => void run('/library/resources/remove', { id: resource.id }, resource.id, t('libResourceDeleted'))}><Trash2 size={14} />{t('pdConfirmRemove')}</Button></div>}
        </div>
      }) : visibleProfiles.map(profile => <div className="lib-profile" key={profile.id}>
        <div className="lib-profile-row"><span className="wb-app-icon is-green"><Layers3 size={20} /></span><div className="lib-name"><strong>{profile.name}</strong><small>{t('libClientsCount').replace('{count}', String(profile.clients.length))}</small></div>
          <div className="lib-actions"><Button variant="ghost" aria-label={t('libViewProfileAria').replace('{name}', profile.name)} title={t('libViewProfileTitle')} aria-expanded={expanded === profile.id} aria-controls={`lib-clients-${profile.id}`} onClick={() => setExpanded(expanded === profile.id ? '' : profile.id)}>{expanded === profile.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button>
            <Button variant="outline" busy={busy === `apply:${profile.id}`} disabled={blocked} onClick={() => void run('/library/profiles/apply', { id: profile.id }, `apply:${profile.id}`, '')}><Play size={14} />{t('libApply')}</Button>
            <Button variant="ghost" className="wb-danger" aria-label={t('libDeleteProfileAria').replace('{name}', profile.name)} title={t('pdConfirmRemove')} disabled={blocked} onClick={() => setRemoving(profile.id)}><Trash2 size={15} /></Button></div></div>
        {expanded === profile.id && <div className="lib-profile-clients" id={`lib-clients-${profile.id}`}>{profile.clients.map(client => <div className="lib-profile-client" key={client.id}>
          <Terminal size={15} /><strong>{client.id}</strong><Badge>{client.mode === 'gateway' ? t('agThirdPartyApi') : t('agNativeConfig')}</Badge>
          <dl><div><dt>{t('agModelId')}</dt><dd>{client.model || t('libClientDefault')}</dd></div><div><dt>{t('agWorkingDir')}</dt><dd>{client.cwd || t('libDefault')}</dd></div><div><dt>{t('agExecutable')}</dt><dd>{client.executable || t('libAutoDetect')}</dd></div></dl>
        </div>)}</div>}
        {removing === profile.id && <div className="wb-remove lib-confirm"><span>{t('libDeleteProfileConfirm').replace('{name}', profile.name)}</span><Button variant="outline" disabled={!!busy} onClick={() => setRemoving('')}>{t('pdCancel')}</Button>
          <Button variant="outline" className="wb-danger" busy={busy === profile.id} disabled={!!busy} onClick={() => void run('/library/profiles/remove', { id: profile.id }, profile.id, t('libProfileDeleted'))}><Trash2 size={14} />{t('pdConfirmRemove')}</Button></div>}
      </div>)}
      {!data && loading && <div className="wb-empty" role="status"><RefreshCw size={22} /><strong>{t('libLoading')}</strong></div>}
      {data && !(tab === 'resources' ? visibleResources.length : visibleProfiles.length) && <div className="wb-empty"><Layers3 size={24} />
        <strong>{search || (tab === 'resources' && kind !== 'all') ? t('libNoMatch') : tab === 'resources' ? t('libNoResourcesYet') : t('libNoProfilesYet')}</strong>
        {search || (tab === 'resources' && kind !== 'all') ? <Button variant="outline" onClick={() => { setSearch(''); setKind('all') }}>{t('libClearFilter')}</Button>
          : <Button variant="outline" disabled={blocked} onClick={() => tab === 'resources' ? setEditor('new') : setProfileEditor(true)}><Plus size={15} />{tab === 'resources' ? t('libCreateResource') : t('libSaveCurrentProfile')}</Button>}</div>}
    </section>
    {editor && active && <ResourceEditor resource={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)} onSaved={() => saved(t('libResourceSaved'))} />}
    {profileEditor && active && <ProfileEditor onClose={() => setProfileEditor(false)} onSaved={() => saved(t('libProfileSaved'))} />}
  </div>
}
