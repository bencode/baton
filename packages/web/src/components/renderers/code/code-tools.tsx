import { SearchIcon, WrapIcon } from '../../icons'

// Search and line wrapping for a code view.
export const CodeTools = ({
  wrap,
  onWrapChange,
  onSearch,
}: {
  wrap: boolean
  onWrapChange(wrap: boolean): void
  onSearch(): void
}) => (
  <>
    <button
      type="button"
      className="ui-icon-button"
      aria-label="在文件中搜索"
      title="在文件中搜索"
      onClick={onSearch}
    >
      <SearchIcon />
    </button>
    <button
      type="button"
      className="ui-icon-button"
      aria-label="自动换行"
      title="自动换行"
      aria-pressed={wrap}
      onClick={() => onWrapChange(!wrap)}
    >
      <WrapIcon />
    </button>
  </>
)
