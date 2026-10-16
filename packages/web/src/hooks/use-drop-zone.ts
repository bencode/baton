import { type DragEvent, useEffect, useState } from 'react'

// Drag-and-drop file intake for a drop zone: tracks the dragging-over state (for
// the highlight ring) and funnels dropped files to `onFiles`. Spread `dropProps`
// onto the element that should accept the drop.
export const useDropZone = (onFiles: (files: File[]) => void, enabled = true) => {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!enabled) setDragging(false)
  }, [enabled])
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      setDragging(enabled)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
      setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      setDragging(false)
      if (enabled) onFiles(Array.from(e.dataTransfer.files))
    },
  }
  return { dragging, dropProps }
}
