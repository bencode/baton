import { type CSSProperties, useSyncExternalStore } from 'react'

// How documents and source views look: one setting for every file tab, kept in
// this browser. Values outside the allowed set fall back to the defaults.
export type ReadingTheme = 'light' | 'paper' | 'dark'
export type ReadingWidth = 'focused' | 'full'
export type ReadingPreferences = {
  fontSize: number
  width: ReadingWidth
  theme: ReadingTheme
  // Source views wrap long lines instead of scrolling sideways.
  wrap: boolean
}

export const READING_FONT_SIZE = { min: 12, max: 20 }
export const defaultReadingPreferences: ReadingPreferences = {
  fontSize: 16,
  width: 'focused',
  theme: 'light',
  wrap: false,
}

const STORAGE_KEY = 'baton.reader.preferences'
const THEMES: readonly ReadingTheme[] = ['light', 'paper', 'dark']
const WIDTHS: readonly ReadingWidth[] = ['focused', 'full']

export const parseReadingPreferences = (raw: string | null): ReadingPreferences => {
  if (raw === null) return defaultReadingPreferences
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    console.warn('[reader] ignoring unreadable reading preferences', error)
    return defaultReadingPreferences
  }
  const stored = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const { fontSize, width, theme, wrap } = stored
  return {
    fontSize:
      typeof fontSize === 'number' &&
      Number.isInteger(fontSize) &&
      fontSize >= READING_FONT_SIZE.min &&
      fontSize <= READING_FONT_SIZE.max
        ? fontSize
        : defaultReadingPreferences.fontSize,
    width: WIDTHS.find(option => option === width) ?? defaultReadingPreferences.width,
    theme: THEMES.find(option => option === theme) ?? defaultReadingPreferences.theme,
    wrap: typeof wrap === 'boolean' ? wrap : defaultReadingPreferences.wrap,
  }
}

const load = (): ReadingPreferences => {
  try {
    return parseReadingPreferences(localStorage.getItem(STORAGE_KEY))
  } catch (error) {
    console.warn('[reader] could not read reading preferences', error)
    return defaultReadingPreferences
  }
}

// One shared snapshot so every open document updates together.
let current: ReadingPreferences | null = null
const listeners = new Set<() => void>()

const snapshot = (): ReadingPreferences => {
  current ??= load()
  return current
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const save = (next: ReadingPreferences): void => {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (error) {
    console.warn('[reader] could not save reading preferences', error)
  }
  for (const listener of listeners) listener()
}

export const useReadingPreferences = (): [
  ReadingPreferences,
  (next: ReadingPreferences) => void,
] => [useSyncExternalStore(subscribe, snapshot), save]

// Attributes of the element that carries the reading theme, width, and text size.
export const readingSurfaceProps = (preferences: ReadingPreferences) => ({
  className: 'reader-surface',
  'data-reading-theme': preferences.theme,
  'data-reading-width': preferences.width,
  style: { '--reader-font-size': `${preferences.fontSize}px` } as CSSProperties,
})
