// VAPID identifies this server to browser push services; no registration needed.
// Generate a pair once with `npx web-push generate-vapid-keys`. Rotating it
// invalidates every existing subscription. Unset → push is disabled.
export type VapidConfig = { publicKey: string; privateKey: string; subject: string }

export const vapidConfig = (env: NodeJS.ProcessEnv = process.env): VapidConfig | null => {
  const publicKey = env.BATON_VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.BATON_VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return {
    publicKey,
    privateKey,
    subject: env.BATON_VAPID_SUBJECT?.trim() || 'https://baton.fmap.dev',
  }
}
