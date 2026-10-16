import { Select as Primitive } from '@base-ui/react/select'
import { type KeyboardEvent, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from './icons'

export type SelectProps = {
  value: string | null
  options: readonly { value: string; label: string }[]
  onValueChange(value: string): void
  'aria-label': string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export const Select = ({
  value,
  options,
  onValueChange,
  'aria-label': label,
  placeholder,
  disabled,
  className = '',
}: SelectProps) => {
  const container = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const dismiss = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <span ref={container} className={`ui-custom-select ${className}`}>
      <Primitive.Root
        value={value}
        items={[...options]}
        open={open}
        onOpenChange={setOpen}
        onValueChange={next => {
          if (next !== null) onValueChange(next)
        }}
        disabled={disabled}
        modal={false}
      >
        <Primitive.Trigger
          ref={trigger}
          className="ui-custom-select-trigger"
          aria-label={label}
          onKeyDown={dismiss}
        >
          <Primitive.Value placeholder={placeholder} className="ui-custom-select-value" />
          <Primitive.Icon>
            <ChevronDownIcon />
          </Primitive.Icon>
        </Primitive.Trigger>
        <Primitive.Portal container={container}>
          <Primitive.Positioner
            className="ui-custom-select-positioner"
            sideOffset={4}
            align="start"
            alignItemWithTrigger={false}
            positionMethod="fixed"
            collisionBoundary={[]}
            collisionPadding={8}
          >
            <Primitive.Popup
              className="ui-custom-select-popup"
              finalFocus={trigger}
              onKeyDown={dismiss}
            >
              <Primitive.List>
                {options.map(option => (
                  <Primitive.Item
                    key={option.value}
                    value={option.value}
                    className="ui-custom-select-item"
                    title={option.label}
                  >
                    <Primitive.ItemText className="ui-custom-select-item-label">
                      {option.label}
                    </Primitive.ItemText>
                    <Primitive.ItemIndicator>
                      <CheckIcon />
                    </Primitive.ItemIndicator>
                  </Primitive.Item>
                ))}
              </Primitive.List>
            </Primitive.Popup>
          </Primitive.Positioner>
        </Primitive.Portal>
      </Primitive.Root>
    </span>
  )
}
