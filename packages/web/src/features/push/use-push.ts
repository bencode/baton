import { useEffect, useState } from 'react'
import type { Api } from '../../api'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

// unsupported: no Push API (iOS only exposes it to home-screen apps) or the server
// has no VAPID key. denied: the user blocked notifications in system settings.
export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

type PushStatus = { state: PushState; publicKey: string | null }

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const currentSubscription = async () =>
  (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription() ?? null

// VAPID keys travel as base64url; PushManager wants the raw bytes.
const keyBytes = (base64url: string): Uint8Array<ArrayBuffer> => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

const detect = async (api: Api): Promise<PushStatus> => {
  if (!supported()) return { state: 'unsupported', publicKey: null }
  const { publicKey } = await api.push.config()
  if (!publicKey) return { state: 'unsupported', publicKey }
  if (Notification.permission === 'denied') return { state: 'denied', publicKey }
  const sub = await currentSubscription()
  // Re-sending is an upsert: it heals a lost server row and re-binds the device
  // to whoever is logged in now.
  if (sub) await api.push.subscribe(sub.toJSON())
  return { state: sub ? 'on' : 'off', publicKey }
}

export const usePush = () => {
  const api = useApi()
  const [revision, setRevision] = useState(0)
  const { data, error } = useAsync(() => detect(api), revision)
  useEffect(() => {
    if (error) console.error('[push] status check failed', error)
  }, [error])
  const refresh = () => setRevision(value => value + 1)

  // requestPermission must run first, inside the click, for iOS to show the prompt.
  const enable = async () => {
    if (!data?.publicKey) return
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(data.publicKey),
      })
      await api.push.subscribe(sub.toJSON())
    }
    refresh()
  }

  const disable = async () => {
    const sub = await currentSubscription()
    if (sub) {
      await api.push.unsubscribe(sub.endpoint)
      await sub.unsubscribe()
    }
    refresh()
  }

  return { state: data?.state ?? null, enable, disable }
}
