import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useDropZone } from './use-drop-zone'

afterEach(cleanup)
test('only files highlight; moving within the zone keeps it; disabled drops cannot navigate or upload', () => {
  const onFiles = vi.fn()
  const Host = ({ enabled = true }: { enabled?: boolean }) => {
    const { dragging, dropProps } = useDropZone(onFiles, enabled)
    return (
      <div {...dropProps} data-testid="zone">
        <span>{dragging ? '拖入中' : '未拖入'}</span>
      </div>
    )
  }
  const view = render(<Host />)
  const zone = screen.getByTestId('zone')
  fireEvent.dragOver(zone, { dataTransfer: { types: ['text/plain'] } })
  expect(screen.getByText('未拖入')).toBeTruthy()
  const file = new File(['a'], 'a.txt')
  const dataTransfer = { types: ['Files'], files: [file] }
  fireEvent.dragOver(zone, { dataTransfer })
  expect(screen.getByText('拖入中')).toBeTruthy()
  fireEvent(zone, new MouseEvent('dragleave', { bubbles: true, relatedTarget: zone.firstChild }))
  expect(screen.getByText('拖入中')).toBeTruthy()
  fireEvent.drop(zone, { dataTransfer })
  expect(onFiles).toHaveBeenCalledExactlyOnceWith([file])
  fireEvent.dragOver(zone, { dataTransfer })
  view.rerender(<Host enabled={false} />)
  expect(screen.getByText('未拖入')).toBeTruthy()
  expect(fireEvent.drop(zone, { dataTransfer })).toBe(false)
  expect(onFiles).toHaveBeenCalledOnce()
})
