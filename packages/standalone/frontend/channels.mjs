import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { shared } from 'ofm-shared-client'
import { ChannelBrowser } from './components/channel-browser'
import { getDict, getLocale } from './i18n'
import 'ofm-shared-styles.css'

const { EacAuth, useEacLogin, DICT, Tank, usePool, poolReading, capacityText, CHANNEL_PROVIDERS, LedgerPage, LogsPage } = shared
const h = React.createElement
const t = key => DICT.zh[key] ?? key
t.locale = 'zh'
let requestLifetime = new AbortController()
const ctx = {
  connection: { rpc: {
    async call(_base, _method, payload, signal) {
      const lifetime = requestLifetime.signal
      const response = await fetch('/api/management/channels/rpc', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.any([signal, lifetime]), credentials: 'same-origin',
      })
      const result = await response.json()
      lifetime.throwIfAborted()
      if (response.status === 401) window.dispatchEvent(new CustomEvent('ofm:unauthorized'))
      if (!response.ok) throw new Error(result.error ?? (getLocale() === 'en' ? 'Channel request failed' : '渠道请求失败'))
      return result
    },
  } },
}
async function rpc(method, payload = {}) {
  const result = await ctx.connection.rpc.call('/api', 'channel-pack', { method, payload }, AbortSignal.timeout(180000))
  if (!result.ok) throw new Error(result.error?.message ?? (getLocale() === 'en' ? 'Channel operation failed' : '渠道操作失败'))
  return result.value
}
const lockedProviders = new Set(['loomy'])

function ChannelTools({ summary }) {
  const dict = getDict()
  const [provider, setProvider] = React.useState('lobsterai')
  const [status, setStatus] = React.useState()
  const [lock, setLock] = React.useState()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [accounts, setAccounts] = React.useState([])
  const [account, setAccount] = React.useState('')
  const [nickname, setNickname] = React.useState('')
  const file = React.useRef()
  const generation = React.useRef(0)
  const reload = React.useCallback(async () => {
    const started = ++generation.current
    const [statuses, value, nextLock] = await Promise.all([
      rpc('provider.status', { providers: [provider] }),
      rpc('account.list', { provider }),
      lockedProviders.has(provider) ? rpc('credits.permanentLock', { provider }) : undefined,
    ])
    if (started !== generation.current) return
    setStatus(statuses.statuses[provider])
    setAccounts(value.accounts)
    setLock(nextLock)
  }, [provider])
  React.useEffect(() => {
    setStatus(undefined); setLock(undefined); setAccounts([]); setAccount(''); setNickname(''); setMessage('')
    let active = true
    void reload().catch(error => { if (active) setMessage(error.message) })
    return () => { active = false; generation.current++ }
  }, [reload])
  const run = async action => {
    setBusy(true); setMessage('')
    try {
      await action()
      await reload()
      window.dispatchEvent(new CustomEvent('ofm:channels'))
      summary.reload?.()
      setMessage(dict.ctSaved)
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  const backup = async () => {
    const value = await rpc('backup.export')
    const blob = new Blob([JSON.stringify(value.payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `ofm-channels-${new Date().toISOString().slice(0, 10)}.json`
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  const importFile = async event => {
    const selected = event.target.files[0]
    event.target.value = ''
    if (!selected) return
    if (selected.size > 8 * 1024 * 1024) { setMessage(dict.ctBackupSizeLimit); return }
    if (!window.confirm(dict.ctImportConfirm)) return
    await run(async () => { await rpc('backup.import', { payload: JSON.parse(await selected.text()) }) })
  }
  return h('section', { className: 'ofm_hero', 'aria-label': dict.ctProviderAndDataMgmt },
    h('h3', null, dict.ctProviderAndDataMgmt),
    h('div', { className: 'ofm_row' },
      h('label', null, dict.ctProviderLabel, h('select', { value: provider, disabled: busy, onChange: event => setProvider(event.target.value) },
        CHANNEL_PROVIDERS.map(row => h('option', { value: row.id, key: row.id }, row.name)))),
      h('button', { className: 'ofm_btn', disabled: busy || !status, onClick: () => run(() => rpc('provider.setEnabled', { provider, enabled: status.closed === true })) },
        status?.closed ? dict.ctEnableProvider : dict.ctDisableProvider),
      lock ? h('label', null, h('input', { type: 'checkbox', checked: lock.locked === true, disabled: busy, onChange: event => run(() => rpc('credits.permanentLock', { provider, locked: event.target.checked })) }), dict.ctLockPermanentCredits) : null),
    lock ? h('p', { className: 'ofm_note' }, lock.windowDays ? dict.ctLockNoteWindow.replace('{days}', lock.windowDays) : dict.ctLockNoteDefault) : null,
    h('div', { className: 'ofm_row' },
      h('label', null, dict.ctAccountLabel, h('select', { value: account, disabled: busy, onChange: event => { setAccount(event.target.value); setNickname(accounts.find(row => row.id === event.target.value)?.nickname ?? '') } },
        h('option', { value: '' }, dict.ctSelectAccount),
        accounts.map(row => h('option', { value: row.id, key: row.id }, row.nickname ?? row.id)))),
      h('input', { 'aria-label': dict.ctNicknamePlaceholder, value: nickname, placeholder: dict.ctNicknamePlaceholder, disabled: !account || busy, onChange: event => setNickname(event.target.value) }),
      h('button', { className: 'ofm_btn', disabled: !account || busy, onClick: () => run(() => rpc('account.update', { accountId: account, patch: { nickname } })) }, dict.ctSaveNickname),
      h('button', { className: 'ofm_btn', disabled: !account || busy, onClick: () => run(() => rpc('account.reorder', { provider, orderedIds: [account, ...accounts.filter(row => row.id !== account).map(row => row.id)] })) }, dict.ctPrioritizeUse),
      h('button', { className: 'ofm_btn', disabled: !account || busy, onClick: () => run(() => rpc('account.reset', { accountId: account })) }, dict.ctResetRateLimit)),
    h('div', { className: 'ofm_row ofm_acts' },
      h('button', { className: 'ofm_btn', disabled: busy, onClick: () => run(backup) }, dict.ctExportBackup),
      h('button', { className: 'ofm_btn', disabled: busy, onClick: () => file.current.click() }, dict.ctImportBackup),
      h('input', { ref: file, type: 'file', hidden: true, accept: '.json,application/json', onChange: importFile })),
    h('p', { className: 'ofm_note' }, dict.ctBackupNote),
    message ? h('p', { role: 'status', className: 'ofm_note' }, message) : null)
}

function ChannelConsole({ summary }) {
  const dict = getDict()
  const [page, setPage] = React.useState('accounts')
  return h(React.Fragment, null,
    h('header', { className: 'dashboard-heading' },
      h('div', null, h('div', { className: 'heading-eyebrow' }, dict.ctHeadingEyebrow),
        h('h1', null, dict.ctHeadingTitle), h('p', null, dict.ctHeadingSubtitle))),
    h('div', { className: 'ofm_seg', role: 'tablist', 'aria-label': dict.ctHeadingTitle },
      [['accounts', dict.ctTabAccounts], ['ledger', dict.ctTabLedger], ['logs', dict.ctTabLogs], ['tools', dict.ctTabTools]].map(([id, name]) =>
        h('button', { key: id, role: 'tab', 'aria-selected': page === id, onClick: () => setPage(id) }, name))),
    page === 'accounts' ? h(ChannelBrowser, { rpc, summary })
      : page === 'ledger' ? h(LedgerPage, { t, ctx, summary })
        : page === 'logs' ? h(LogsPage, { t, ctx, summary })
          : h(ChannelTools, { summary }))
}

function EacPage({ summary }) {
  const dict = getDict()
  const [auth, onAuth] = React.useState(summary.eacAuth)
  const login = useEacLogin({ t, summary, onAuth })
  const { pool } = usePool()
  const reading = pool == null ? null : poolReading(pool)
  React.useEffect(() => { login.refresh() }, [login.refresh])
  return h(React.Fragment, null,
    h('header', { className: 'dashboard-heading' },
      h('div', null, h('div', { className: 'heading-eyebrow' }, dict.ctEacEyebrow),
        h('h1', null, dict.ctEacTitle), h('p', null, dict.ctEacSubtitle))),
    h(EacAuth, { t, auth, eacLogin: login }),
    h('div', { className: 'ofm_hero' },
      h('h3', null, dict.ctEacPoolHeading),
      pool == null ? h('p', null, pool === undefined ? dict.ctEacQuerying : dict.ctEacQueryFailed)
        : h(React.Fragment, null,
          h(Tank, { pct: reading.pct, level: reading.level, size: 'xl' }),
          h('p', null, dict.ctEacPoolStatus.replace('{inflight}', pool.inflight).replace('{active}', reading.active ?? 'Unknown').replace('{pool}', pool.pool ?? 'Unknown')),
          h('p', null, capacityText(pool, t)))))
}

let root
export function show(kind, summary) {
  if (!root) {
    requestLifetime = new AbortController()
    root = createRoot(document.getElementById('channel-root'))
  }
  root.render(h(kind === 'eac' ? EacPage : ChannelConsole, { t, ctx, summary }))
}
export function hide() {
  requestLifetime.abort()
  if (root) { root.unmount(); root = undefined }
}
