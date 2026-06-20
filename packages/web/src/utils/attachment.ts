// Shared attachment helpers for the composer (sessions + channels).

// Pull image files out of a paste/clipboard synchronously — getAsFile must run
// inside the event handler.
export const extractImageFiles = (items: DataTransferItemList): File[] =>
  Array.from(items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter((f): f is File => f !== null)

// Clipboard images arrive as a File with an empty name; give it a stable one
// (File.name is read-only, so wrap it) so the upload + filename read well. The
// batch index keeps concurrently-pasted blobs from colliding on name.
export const renamePasted = (file: File, i: number): File => {
  const ext = file.type.split('/')[1] ?? 'bin'
  return new File([file], `paste-${Date.now()}-${i}.${ext}`, { type: file.type })
}
