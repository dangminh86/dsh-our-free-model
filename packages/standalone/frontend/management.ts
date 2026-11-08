import { useCallback, useEffect, useRef, useState } from 'react'
import { getLocale } from './i18n'

const BACKEND_ERROR_MAP: Record<string, string> = {
  '此管理操作需要已登录的本地管理会话': 'This management operation requires an active local management session.',
  '管理会话已失效': 'Management session has expired.',
  '登录链接已失效或登录令牌不正确': 'Login link has expired or login token is invalid.',
  '管理会话过多，请稍后重试': 'Too many management sessions, please try again later.',
  '请先登录管理页面': 'Please log in to the management page first.',
  '请先在插件中心开启开发者模式': 'Please enable Developer Mode in Plugin Center first.',
  '模型工作台不可用': 'Model Workbench is unavailable.',
  '模型工作台尚未启动': 'Model Workbench has not started.',
  '客户端操作不存在': 'Client operation does not exist.',
  '路由组操作不存在': 'Routing group operation does not exist.',
  '资源操作不存在': 'Resource operation does not exist.',
  '供应商操作不存在': 'Provider operation does not exist.',
  '订阅操作不存在': 'Subscription operation does not exist.',
  'enabled 必须是布尔值': 'enabled must be a boolean.',
  'probe 必须是布尔值': 'probe must be a boolean.',
  'EAC 接口不存在': 'EAC endpoint does not exist.',
  '无法移除本地授权': 'Cannot remove local authorization.',
  'LAN key rotation requires only confirm: true': 'LAN key rotation requires only confirm: true.',
  '请确认轮换 API Key': 'Please confirm API key rotation.',
  '推理服务已暂停，请先在服务设置中启用': 'Inference service is paused. Enable it in Service Settings first.',
  '请选择有效模型': 'Please select a valid model.',
  '管理接口不存在': 'Management endpoint does not exist.',
  '请求必须使用 application/json': 'Request must use application/json.',
  '请求内容过大': 'Request payload is too large.',
  '请求不是有效 JSON': 'Request is not valid JSON.',
  '请求必须是 JSON 对象': 'Request must be a JSON object.',
  '无法保存设置，请检查数据目录权限和磁盘空间': 'Unable to save settings. Please check data directory permissions and disk space.',
  '请从本机登录页面点击获取令牌': 'Please request a token from the local login page.',
  '获取令牌不接受路径或命令参数': 'Token retrieval does not accept path or command parameters.',
  '已请求打开终端，请检查弹出的窗口，30 秒后可重试': 'Terminal launch requested. Check the popup window; retry available in 30s.',
  '端口必须为 0 到 65535 的整数': 'Port must be an integer between 0 and 65535.',
  '独立端资源清单无效': 'Invalid standalone resource manifest.',
  '客户端配置文件无效': 'Invalid client configuration file.'
}

function translateBackendError(msg: string, isEn: boolean): string {
  if (!isEn) return msg
  return BACKEND_ERROR_MAP[msg] ?? msg
}

function redact(value: string, body: unknown): string {
  const isEn = getLocale() === 'en'
  const tag = isEn ? '[REDACTED]' : '[已隐藏]'
  const secrets: string[] = []
  const collect = (entry: unknown) => {
    if (typeof entry === 'string' && entry) secrets.push(entry)
    else if (entry && typeof entry === 'object') Object.values(entry).forEach(collect)
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    collect(record.credentials)
    collect(record.apiKey)
  }
  return secrets.reduce((text, secret) => text.split(secret).join(tag), value)
    .replace(/\b(?:sk-|AIza|Bearer\s+)[\w.-]{8,}/gi, tag)
}

export async function management<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const isEn = getLocale() === 'en'
  const response = await fetch(`/api/management${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  })
  if (response.status === 401) window.dispatchEvent(new CustomEvent('ofm:unauthorized'))
  const value = await response.json().catch(() => { throw new Error(isEn ? `Invalid server response (${response.status})` : `服务返回了无效响应 (${response.status})`) })
  if (!response.ok || value?.ok === false) {
    const rawReason = value?.error?.message ?? value?.error ?? value?.message
    const reasonText = typeof rawReason === 'string' ? translateBackendError(rawReason, isEn) : (isEn ? `Request failed (${response.status})` : `请求失败 (${response.status})`)
    throw new Error(redact(reasonText, body))
  }
  return value as T
}

export const failureMessage = (error: unknown) => {
  const isEn = getLocale() === 'en'
  if (!(error instanceof Error)) {
    return isEn ? 'Operation failed, please try again.' : '操作失败，请重试。'
  }
  if (error.name === 'TimeoutError') {
    return isEn ? 'Request timed out, please try again.' : '请求超时，请重试。'
  }
  return translateBackendError(error.message, isEn)
}

export function useManagementResource<T>(path: string, active: boolean) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const live = useRef(false)
  const reload = useCallback(async () => {
    if (!live.current) return
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setLoading(true)
    try {
      const value = await management<T>(path, undefined, next.signal)
      if (!next.signal.aborted && live.current) { setData(value); setError('') }
    } catch (reason) {
      if (!next.signal.aborted && live.current) setError(failureMessage(reason))
    } finally { if (!next.signal.aborted && live.current) setLoading(false) }
  }, [path])
  useEffect(() => {
    live.current = active
    if (active) void reload()
    return () => { live.current = false; controller.current?.abort() }
  }, [active, reload])
  return { data, error, loading, reload }
}
