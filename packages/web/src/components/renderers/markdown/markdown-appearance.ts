import type { CSSProperties } from 'react'

// How a rendered Markdown document looks: text size, page width, and theme.
export type MarkdownTheme = 'light' | 'paper' | 'dark'
export type MarkdownWidth = 'focused' | 'full'
export type MarkdownAppearance = {
  fontSize: number
  width: MarkdownWidth
  theme: MarkdownTheme
}

export const MARKDOWN_FONT_SIZE = { min: 12, max: 20 }
export const MARKDOWN_THEMES: readonly MarkdownTheme[] = ['light', 'paper', 'dark']
export const MARKDOWN_WIDTHS: readonly MarkdownWidth[] = ['focused', 'full']
export const defaultMarkdownAppearance: MarkdownAppearance = {
  fontSize: 16,
  width: 'focused',
  theme: 'light',
}

// Attributes of the element that carries the theme, width, and text size.
export const appearanceSurfaceProps = (appearance: MarkdownAppearance) => ({
  className: 'reader-surface',
  'data-reading-theme': appearance.theme,
  'data-reading-width': appearance.width,
  style: { '--reader-font-size': `${appearance.fontSize}px` } as CSSProperties,
})
