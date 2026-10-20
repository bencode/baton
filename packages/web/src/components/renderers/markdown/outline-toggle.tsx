import { PanelIcon } from '../../icons'

// Shows or hides a Markdown document's outline.
export const OutlineToggle = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange(open: boolean): void
}) => (
  <button
    type="button"
    className="ui-icon-button"
    aria-label="大纲"
    title={open ? '隐藏大纲' : '显示大纲'}
    aria-pressed={open}
    onClick={() => onOpenChange(!open)}
  >
    <PanelIcon />
  </button>
)
