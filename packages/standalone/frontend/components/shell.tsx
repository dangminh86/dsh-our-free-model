import { Coffee, Activity, BarChart3, BookOpen, Boxes, Cable, ChevronRight, Globe, Handshake, Image, LayoutDashboard, LogOut, Moon, Network, Palette, PanelsTopLeft, Puzzle, Route, RotateCw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, Monitor, LibraryBig, Wrench, Languages } from 'lucide-react'
import { useState } from 'react'
import type { ComponentType } from 'react'
import { flushSync } from 'react-dom'
import brandMark from '../../../../icon.svg?inline'
import { Badge, Button } from './ui'
import type { Host, Page, PluginPage, Summary } from '../types'
import { hasDesktopBridge } from '../desktop-update'
import { useT, useLocale, type TranslationKey } from '../i18n'

type NavIcon = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>
interface NavItem { id: Page; name: string; icon: NavIcon }
interface NavGroup { label: string; items: NavItem[] }

const CORE_NAVIGATION: NavGroup[] = [
  { label: '工作空间', items: [
    { id: 'overview', name: '概览', icon: LayoutDashboard },
    { id: 'workspace', name: '模型工作台', icon: PanelsTopLeft },
    { id: 'agents', name: '客户端与订阅', icon: Monitor },
    { id: 'models', name: '模型清单', icon: Boxes },
    { id: 'usage', name: '用量统计', icon: Activity },
    { id: 'library', name: '资源库', icon: LibraryBig },
  ] },
  { label: '渠道与连接', items: [
    { id: 'providers', name: '聚合渠道', icon: PanelsTopLeft },
    { id: 'routing', name: '路由组', icon: Route },
    { id: 'channels', name: 'EAC router', icon: Network },
    { id: 'eac', name: 'EAC 协付渠道', icon: Handshake },
    { id: 'connection', name: 'API 接入', icon: Cable },
  ] },
  { label: '管理', items: [
    { id: 'plugins', name: '插件中心', icon: Puzzle },
    { id: 'settings', name: '服务设置', icon: Settings2 },
    { id: 'updates', name: '应用更新', icon: RotateCw },
  ] },
  { label: '项目支持', items: [{ id: 'sponsor', name: '来自赞助商的广告', icon: Coffee }] },
]

const NAV_ITEM_KEYS: Partial<Record<Page, TranslationKey>> = {
  overview: 'navOverview',
  workspace: 'navWorkspace',
  agents: 'navAgents',
  models: 'navModels',
  usage: 'navUsage',
  library: 'navLibrary',
  providers: 'navProviders',
  routing: 'navRouting',
  channels: 'navChannels',
  eac: 'navEac',
  connection: 'navConnection',
  plugins: 'navPlugins',
  settings: 'navSettings',
  updates: 'navUpdates',
  sponsor: 'navSponsor',
}

const NAV_GROUP_KEYS: Record<string, TranslationKey> = {
  '工作空间': 'navGroupWorkspace',
  '渠道与连接': 'navGroupChannels',
  '管理': 'navGroupManagement',
  '项目支持': 'navGroupSupport',
}

const PAGE_ICONS: Record<string, NavIcon> = {
  puzzle: Puzzle,
  sparkles: Sparkles,
  chart: BarChart3,
  tool: Wrench,
  image: Image,
  globe: Globe,
  terminal: Terminal,
  book: BookOpen,
  palette: Palette,
  activity: Activity,
  boxes: Boxes,
  route: Route,
}

export const pageIcon = (name: string): NavIcon => PAGE_ICONS[name] ?? Puzzle

export const navigationPages: Page[] = CORE_NAVIGATION.flatMap(group => group.items.map(item => item.id))

export function pageIdsFor(pluginPages: PluginPage[] = []): Page[] {
  return [...navigationPages, ...pluginPages.map(page => page.id)]
}

type Origin = { x: number; y: number }

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const apply = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('ofm-theme', next) } catch { /* 存储不可用时仅本次会话生效 */ }
    setTheme(next)
  }
  const toggle = (origin?: Origin) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    if (!origin || typeof document.startViewTransition !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return }
    const root = document.documentElement
    const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    root.style.setProperty('--theme-reveal-x', `${origin.x}px`)
    root.style.setProperty('--theme-reveal-y', `${origin.y}px`)
    root.style.setProperty('--theme-reveal-r', `${radius}px`)
    root.classList.add('theme-transitioning')
    const transition = document.startViewTransition(() => { flushSync(() => apply(next)) })
    const finish = () => {
      root.classList.remove('theme-transitioning')
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    }
    transition.finished.then(finish, finish)
  }
  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const t = useT()
  const label = theme === 'dark' ? t('themeToggleToLight') : t('themeToggleToDark')
  return <Button variant="ghost" className="theme-toggle" aria-label={label} title={theme === 'dark' ? t('themeLight') : t('themeDark')}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>
    <span className="theme-toggle-track" data-theme={theme}>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true"><Sun size={16} /></span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true"><Moon size={16} /></span>
    </span>
  </Button>
}

export function LangToggle() {
  const [locale, setLocale] = useLocale()
  const isEn = locale === 'en'
  return <Button variant="ghost" className="lang-toggle" aria-label={isEn ? '切换语言' : 'Toggle language'}
    title={isEn ? 'Switch to Chinese' : '切换到英文'}
    onClick={() => setLocale(isEn ? 'zh' : 'en')}>
    <Languages size={15} style={{ marginRight: 4 }} />
    <span style={{ fontSize: 12, fontWeight: 600 }}>{isEn ? '中' : 'EN'}</span>
  </Button>
}

export const pageNames: Record<string, string> = Object.fromEntries(CORE_NAVIGATION.flatMap(group => group.items.map(item => [item.id, item.name])))

export function pageLabel(page: Page, pluginPages: PluginPage[] = [], t?: (key: TranslationKey) => string): string {
  if (t) {
    const key = NAV_ITEM_KEYS[page]
    if (key) return t(key)
    return pluginPages.find(entry => entry.id === page)?.title ?? t('navPluginFallback')
  }
  return pluginPages.find(entry => entry.id === page)?.title ?? pageNames[page] ?? '插件页面'
}

export function Sidebar({ page, summary, host, onDisclaimer, pluginPages = [] }: { page: Page; summary?: Summary; host: Host; onDisclaimer(): void; pluginPages?: PluginPage[] }) {
  const t = useT()
  const groups: NavGroup[] = pluginPages.length === 0 ? CORE_NAVIGATION : [...CORE_NAVIGATION, {
    label: '插件',
    items: pluginPages.map(entry => ({ id: entry.id, name: entry.title, icon: pageIcon(entry.icon) })),
  }]
  return <>
    <a className="console-brand" href="/" aria-label={t('brandAlt')}>
      <img className="console-mark" src={brandMark} alt="" width={34} height={36} />
      <span>Our Free Model<small>{t('brandSub')}</small></span>
    </a>
    <div className="workspace-switch"><span className="workspace-avatar"><ShieldCheck size={17} /></span>
      <span>{t('workspaceName')}<small>{t('workspaceSub')}</small></span><Badge>{t('workspaceBadge')}</Badge>
    </div>
    <nav className="console-nav" aria-label={t('navAriaLabel')}>{groups.map(group => {
      const groupKey = NAV_GROUP_KEYS[group.label]
      const groupLabel = groupKey ? t(groupKey) : (group.label === '插件' ? t('navPlugins') : group.label)
      return <div className="nav-group" key={group.label}>
        <span className="nav-group-label">{groupLabel}</span>
        {group.items.filter(item => item.id !== 'updates' || hasDesktopBridge()).map(item => {
          const itemKey = NAV_ITEM_KEYS[item.id]
          const itemName = itemKey ? t(itemKey) : item.name
          return <button key={item.id} id={item.id === 'sponsor' ? 'ofm-sponsor-menu-desktop' : undefined} className={`console-nav-item ${item.id === 'sponsor' ? 'ofm-sponsor-nav' : ''} ${page === item.id ? 'selected' : ''}`}
            aria-current={page === item.id ? 'page' : undefined} onClick={() => host.navigate(item.id)}>
            <span className="console-nav-indicator" aria-hidden="true" />
            <item.icon size={18} strokeWidth={1.7} /><span>{itemName}</span>
            {item.id === 'models' && <span className="count-badge">{summary?.catalog.length ?? '—'}</span>}
          </button>
        })}
      </div>
    })}</nav>
    <div className="sidebar-support"><ShieldCheck size={17} /><div><strong>{t('sidebarStorageTitle')}</strong><p>{t('sidebarStorageDesc')}</p></div></div>
    <div className="console-sidebar-footer"><div><span className="status-dot" />{t('sidebarServiceOnline')}<small>v{summary?.version ?? '—'}</small></div>
      <LangToggle /><ThemeToggle /><Button variant="ghost" aria-label={t('logoutLabel')} title={t('logoutTitle')} onClick={() => { void host.logout().catch(host.error) }}><LogOut size={16} /></Button></div>
    <button type="button" className="sidebar-disclaimer" onClick={onDisclaimer}>{t('disclaimerButton')}</button>
  </>
}

export function Topbar({ page, summary, pluginPages = [] }: { page: Page; summary?: Summary; pluginPages?: PluginPage[] }) {
  const t = useT()
  return <><div className="console-breadcrumb"><span>{t('breadcrumbWorkspace')}</span><ChevronRight size={14} /><strong key={page} className="console-breadcrumb-current">{pageLabel(page, pluginPages, t)}</strong></div>
    <div className="console-topbar-status"><span className="status-dot" /><span>{summary?.settings.enabled === false ? t('statusPaused') : t('statusLocal')}</span><span className="topbar-divider" /><span>LOCAL</span></div></>
}
