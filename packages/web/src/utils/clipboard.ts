// Copy text to the clipboard. The Clipboard API only exists in secure contexts
// (HTTPS / localhost); plain-HTTP LAN access (phone testing) falls back to the
// hidden-textarea execCommand path.
export const copyText = (text: string): void => {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}
