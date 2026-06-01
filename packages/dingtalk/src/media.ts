// Resolve a DingTalk richText picture (a `downloadCode`) to its bytes. Flow:
//   1. get an app access_token (cached until ~1min before expiry)
//   2. POST /v1.0/robot/messageFiles/download {downloadCode, robotCode} → downloadUrl
//   3. GET the (short-lived) downloadUrl → bytes
// robotCode for a custom bot is the appKey (= clientId).
export type DownloadedImage = { filename: string; contentType: string; body: Uint8Array }
export type DingtalkCreds = { clientId: string; clientSecret: string }

const TOKEN_URL = 'https://oapi.dingtalk.com/gettoken'
const DOWNLOAD_URL = 'https://api.dingtalk.com/v1.0/robot/messageFiles/download'

let cached: { value: string; expiresAt: number } | null = null

const getAccessToken = async (cfg: DingtalkCreds, now: number): Promise<string> => {
  if (cached && cached.expiresAt > now) return cached.value
  const res = await fetch(`${TOKEN_URL}?appkey=${cfg.clientId}&appsecret=${cfg.clientSecret}`)
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error(`dingtalk gettoken failed: ${JSON.stringify(data)}`)
  cached = { value: data.access_token, expiresAt: now + ((data.expires_in ?? 7200) - 60) * 1000 }
  return data.access_token
}

export const downloadImage = async (
  cfg: DingtalkCreds,
  downloadCode: string,
  index: number,
  now: number = Date.now(),
): Promise<DownloadedImage> => {
  const token = await getAccessToken(cfg, now)
  const meta = await fetch(DOWNLOAD_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': token },
    body: JSON.stringify({ downloadCode, robotCode: cfg.clientId }),
  })
  const data = (await meta.json()) as { downloadUrl?: string }
  if (!data.downloadUrl)
    throw new Error(`messageFiles/download failed (${meta.status}): ${JSON.stringify(data)}`)
  const file = await fetch(data.downloadUrl)
  if (!file.ok) throw new Error(`download ${data.downloadUrl} → ${file.status}`)
  const contentType = file.headers.get('content-type') ?? 'image/jpeg'
  const body = new Uint8Array(await file.arrayBuffer())
  const ext = (contentType.split('/')[1] ?? 'jpg').split(';')[0]
  return { filename: `dingtalk-${index}.${ext}`, contentType, body }
}
