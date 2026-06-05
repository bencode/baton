// Compact Chinese relative time for the session rail (刚刚 / N分钟前 / N小时前 /
// 昨天 / N天前 / M月D日). `now` is injectable for tests.
export const relativeTime = (ms: number, now: number = Date.now()): string => {
  const sec = Math.floor((now - ms) / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day}天前`
  return new Date(ms).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
