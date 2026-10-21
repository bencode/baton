// Switches a file between its rendered form and its source.
export const ViewModeToggle = <M extends string>({
  value,
  options,
  onChange,
}: {
  value: M
  options: readonly { value: M; label: string }[]
  onChange(mode: NoInfer<M>): void
}) => (
  <fieldset className="files-mode" aria-label="显示方式">
    {options.map(option => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </fieldset>
)
