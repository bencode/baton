import { useSyncExternalStore } from 'react'

// installed: already running from the home screen. prompt: Chrome offered its native
// install dialog. ios: Safari has no install API, so the user follows manual steps.
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'unavailable'

// Chromium-only event, absent from lib.dom.
type BeforeInstallPromptEvent = Event & { prompt(): Promise<void> }

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () =>
  listeners.forEach(listener => {
    listener()
  })

// Registered at module load: Chrome can fire the event before React mounts.
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  deferred = event as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  installed = true
  notify()
})

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && navigator.standalone === true)

// iPadOS reports a desktop Mac user agent; touch support tells them apart.
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

const currentMode = (): InstallMode => {
  if (installed || isStandalone()) return 'installed'
  if (deferred) return 'prompt'
  return isIOS() ? 'ios' : 'unavailable'
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The deferred event is single-use; Chrome fires a fresh one if it may ask again.
const install = async () => {
  const event = deferred
  if (!event) return
  deferred = null
  notify()
  await event.prompt()
}

export const useInstall = () => ({
  mode: useSyncExternalStore(subscribe, currentMode, (): InstallMode => 'unavailable'),
  install,
})
