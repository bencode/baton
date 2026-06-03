// Reply into the DingTalk conversation via the per-message sessionWebhook —
// DingTalk hands us a short-lived (~hours) reply URL with each message, so no
// extra send-API credentials are needed. Markdown so the session link renders.
export const reply = async (
  sessionWebhook: string,
  markdown: string,
  title = 'baton',
): Promise<void> => {
  const res = await fetch(sessionWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { title, text: markdown } }),
  })
  if (!res.ok) throw new Error(`reply → ${res.status}: ${await res.text()}`)
}
