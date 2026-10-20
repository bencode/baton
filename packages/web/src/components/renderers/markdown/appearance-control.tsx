import { useId, useState } from 'react'
import { CheckIcon, TypeIcon } from '../../icons'
import { Popover } from '../../popover'
import styles from './appearance-control.module.scss'
import {
  MARKDOWN_FONT_SIZE,
  type MarkdownAppearance,
  type MarkdownTheme,
  type MarkdownWidth,
} from './markdown-appearance'

const WIDTHS: { value: MarkdownWidth; label: string }[] = [
  { value: 'focused', label: '专注' },
  { value: 'full', label: '全宽' },
]
const THEMES: { value: MarkdownTheme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'paper', label: '纸张' },
  { value: 'dark', label: '深色' },
]

// The 「阅读外观」 button and popover for a Markdown document: text size, page
// width, and theme.
export const AppearanceControl = ({
  value,
  onChange,
}: {
  value: MarkdownAppearance
  onChange(next: MarkdownAppearance): void
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const sizeId = useId()
  return (
    <>
      <button
        type="button"
        className="ui-icon-button"
        aria-label="阅读外观"
        title="阅读外观"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={event => setAnchor(anchor ? null : event.currentTarget)}
      >
        <TypeIcon />
      </button>
      <Popover
        anchor={anchor}
        role="dialog"
        label="阅读外观"
        placement="bottom-end"
        className={styles.popover}
        onClose={() => setAnchor(null)}
      >
        <div className={styles.panel}>
          <h3>阅读外观</h3>
          <div className={styles.setting}>
            <div className={styles.header}>
              <label htmlFor={sizeId}>字号</label>
              <output htmlFor={sizeId}>{value.fontSize} px</output>
            </div>
            <div className={styles.range}>
              <span aria-hidden>A</span>
              <input
                id={sizeId}
                type="range"
                min={MARKDOWN_FONT_SIZE.min}
                max={MARKDOWN_FONT_SIZE.max}
                step={1}
                value={value.fontSize}
                onChange={event => onChange({ ...value, fontSize: Number(event.target.value) })}
              />
              <span aria-hidden className={styles.large}>
                A
              </span>
            </div>
          </div>
          <fieldset className={styles.setting}>
            <legend>页面宽度</legend>
            <div className={styles.segments}>
              {WIDTHS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={value.width === option.value}
                  onClick={() => onChange({ ...value, width: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.setting}>
            <legend>主题</legend>
            <div className={styles.themes}>
              {THEMES.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={value.theme === option.value}
                  onClick={() => onChange({ ...value, theme: option.value })}
                >
                  <span className={styles.swatch} data-reading-theme={option.value}>
                    Aa
                    {value.theme === option.value && <CheckIcon />}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </Popover>
    </>
  )
}
