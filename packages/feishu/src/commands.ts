// "/new [message]" — open a fresh session instead of continuing the bound one,
// for when the current session should keep running but you want a parallel
// conversation. The rest of the message (if any) becomes the first prompt.
export const parseNewCommand = (text: string): { forceNew: boolean; text: string } => {
  const m = /^\/new(\s+|$)/.exec(text.trim())
  return m ? { forceNew: true, text: text.trim().slice(m[0].length) } : { forceNew: false, text }
}
