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

// Pure core of "cite a pending attachment": splice a `{label} ` token into `value`
// over the range [start, end) (any selection is replaced) and report the caret
// position that should follow the inserted token.
export const spliceLabelToken = (
  value: string,
  start: number,
  end: number,
  label: string,
): { text: string; caret: number } => {
  const token = `{${label}} `
  return { text: value.slice(0, start) + token + value.slice(end), caret: start + token.length }
}

// Insert a {label} reference token at the textarea caret so the user can cite a
// pending attachment from their text, then restore focus and drop the caret just
// after the token on the next frame. Glue around spliceLabelToken + the DOM.
export const insertLabelToken = (
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (v: string) => void,
  label: string,
): void => {
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? value.length
  const { text, caret } = spliceLabelToken(value, start, end, label)
  setValue(text)
  requestAnimationFrame(() => {
    el?.focus()
    el?.setSelectionRange(caret, caret)
  })
}
