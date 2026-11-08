import { useCallback, useEffect, useRef, useState } from 'react'
import { getLocale } from './i18n'

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
    const reason = value?.error?.message ?? value?.error ?? value?.message
    throw new Error(redact(typeof reason === 'string' ? reason : (isEn ? `Request failed (${response.status})` : `请求失败 (${response.status})`), body))
  }
  return value as T
}

export const failureMessage = (error: unknown) => {
  const isEn = getLocale() === 'en'
  return error instanceof Error
    ? error.name === 'TimeoutError' ? (isEn ? 'Request timed out, please try again.' : '请求超时，请重试。') : error.message
    : (isEn ? 'Operation failed, please try again.' : '操作失败，请重试。')
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
