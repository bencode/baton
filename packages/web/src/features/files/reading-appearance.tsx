import { useId, useState } from 'react'
import { CheckIcon, TypeIcon } from '../../components/icons'
import { Popover } from '../../components/popover'
import {
  READING_FONT_SIZE,
  type ReadingTheme,
  type ReadingWidth,
  useReadingPreferences,
} from './reading-preferences'

const WIDTHS: { value: ReadingWidth; label: string }[] = [
  { value: 'focused', label: '专注' },
  { value: 'full', label: '全宽' },
]
const THEMES: { value: ReadingTheme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'paper', label: '纸张' },
  { value: 'dark', label: '深色' },
]

// The 「阅读外观」 button and popover: text size, page width, and theme for every
// rendered document.
export const ReadingAppearance = () => {
  const [preferences, setPreferences] = useReadingPreferences()
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
        className="reading-appearance-popover"
        onClose={() => setAnchor(null)}
      >
        <div className="reading-appearance">
          <h3>阅读外观</h3>
          <div className="reading-appearance-setting">
            <div className="reading-appearance-header">
              <label htmlFor={sizeId}>字号</label>
              <output htmlFor={sizeId}>{preferences.fontSize} px</output>
            </div>
            <div className="reading-appearance-range">
              <span aria-hidden>A</span>
              <input
                id={sizeId}
                type="range"
                min={READING_FONT_SIZE.min}
                max={READING_FONT_SIZE.max}
                step={1}
                value={preferences.fontSize}
                onChange={event =>
                  setPreferences({ ...preferences, fontSize: Number(event.target.value) })
                }
              />
              <span aria-hidden className="reading-appearance-large">
                A
              </span>
            </div>
          </div>
          <fieldset className="reading-appearance-setting">
            <legend>页面宽度</legend>
            <div className="reading-appearance-segments">
              {WIDTHS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={preferences.width === option.value}
                  onClick={() => setPreferences({ ...preferences, width: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="reading-appearance-setting">
            <legend>主题</legend>
            <div className="reading-appearance-themes">
              {THEMES.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={preferences.theme === option.value}
                  onClick={() => setPreferences({ ...preferences, theme: option.value })}
                >
                  <span className="reading-appearance-swatch" data-reading-theme={option.value}>
                    Aa
                    {preferences.theme === option.value && <CheckIcon />}
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
