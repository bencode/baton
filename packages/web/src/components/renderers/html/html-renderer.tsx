import styles from './html-renderer.module.scss'

// Where a page's own files are served, both ending in '/': `directory` is the
// page's folder (relative URLs), `root` the top of its tree ('/'-rooted URLs).
export type HtmlResources = { directory: string; root: string }

const CDNS = 'https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com'

// Scripts never run (the frame has no allow-scripts); this further limits what the
// page loads to this site, inline data, and well-known CDNs for styles and fonts.
const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  `style-src 'self' 'unsafe-inline' ${CDNS}`,
  `font-src 'self' data: ${CDNS}`,
  "media-src 'self' data: blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'self'",
].join('; ')

const ROOTED = /^\/(?!\/)/

// The page as the preview frame shows it: the policy above first, relative URLs
// resolved under `directory` with links that cannot open, '/'-rooted URLs moved
// under `root`, and the page's own <base> and refresh removed so it cannot point
// elsewhere or navigate the frame away.
export const previewDocument = (html: string, resources: HtmlResources | null): string => {
  const page = new DOMParser().parseFromString(html, 'text/html')
  for (const element of page.querySelectorAll('base, meta[http-equiv="refresh" i]'))
    element.remove()
  if (resources)
    for (const element of page.querySelectorAll('[src], [href], [poster]'))
      for (const name of ['src', 'href', 'poster']) {
        const value = element.getAttribute(name)
        if (value && ROOTED.test(value))
          element.setAttribute(name, `${resources.root}${value.slice(1)}`)
      }
  const policy = page.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = PREVIEW_CSP
  const head: HTMLElement[] = [policy]
  if (resources) {
    const base = page.createElement('base')
    base.href = resources.directory
    base.target = '_blank'
    head.push(base)
  }
  page.head.prepend(...head)
  return `${page.doctype ? '<!doctype html>' : ''}${page.documentElement.outerHTML}`
}

// An HTML page shown without running anything: the frame may reach this site for
// the page's own files (allow-same-origin) but never runs scripts, so nothing in
// the page can act with the viewer's session. Never add allow-scripts here.
export const HtmlRenderer = ({
  html,
  title,
  resources,
}: {
  html: string
  title: string
  resources: HtmlResources | null
}) => (
  <iframe
    className={styles.frame}
    title={title}
    sandbox="allow-same-origin"
    referrerPolicy="no-referrer"
    srcDoc={previewDocument(html, resources)}
  />
)
