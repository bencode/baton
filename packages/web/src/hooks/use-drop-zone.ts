import { type DragEvent, useState } from 'react'

// Drag-and-drop file intake for a drop zone: tracks the dragging-over state (for
// the highlight ring) and funnels dropped files to `onFiles`. Spread `dropProps`
// onto the element that should accept the drop.
export const useDropZone = (onFiles: (files: File[]) => void) => {
  const [dragging, setDragging] = useState(false)
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      onFiles(Array.from(e.dataTransfer.files))
    },
  }
  return { dragging, dropProps }
}
