import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { HtmlRenderer, previewDocument } from './html-renderer'

afterEach(cleanup)

const resources = { directory: '/raw/main/site/', root: '/raw/main/' }

const PAGE = [
  '<!doctype html><html><head>',
  '<base href="https://elsewhere.example/">',
  '<meta http-equiv="Refresh" content="0; url=https://elsewhere.example/">',
  '<link rel="stylesheet" href="report.css">',
  '</head><body>',
  '<img src="/img/a.png"><img src="./b.png"><img src="//cdn.example/c.png">',
  '<video poster="/img/poster.png"></video>',
  '<script>document.title = "ran"</script>',
  '</body></html>',
].join('')

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

test('the preview leads with its policy and base, and drops what would point elsewhere', () => {
  const page = parse(previewDocument(PAGE, resources))
  const [policy, base] = [...page.head.children]
  expect(policy?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
  expect(policy?.getAttribute('content')).toContain("default-src 'none'")
  expect(policy?.getAttribute('content')).not.toContain('script-src')
  expect(base?.getAttribute('href')).toBe('/raw/main/site/')
  expect(base?.getAttribute('target')).toBe('_blank')
  expect(page.querySelectorAll('base')).toHaveLength(1)
  expect(page.querySelector('meta[http-equiv="refresh" i]')).toBeNull()
  expect(previewDocument(PAGE, resources).startsWith('<!doctype html>')).toBe(true)
})

test("only '/'-rooted addresses move under the root; relative ones resolve against the base", () => {
  const page = parse(previewDocument(PAGE, resources))
  expect([...page.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
    '/raw/main/img/a.png',
    './b.png',
    '//cdn.example/c.png',
  ])
  expect(page.querySelector('video')?.getAttribute('poster')).toBe('/raw/main/img/poster.png')
  expect(page.querySelector('link')?.getAttribute('href')).toBe('report.css')
})

test('without resources the page gets its policy but no base', () => {
  const page = parse(previewDocument(PAGE, null))
  expect(page.head.firstElementChild?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
  expect(page.querySelector('base')).toBeNull()
  expect(page.querySelector('img')?.getAttribute('src')).toBe('/img/a.png')
})

test('the frame may load the page files but never run scripts', () => {
  const { container } = render(
    <HtmlRenderer html={PAGE} title="report.html" resources={resources} />,
  )
  const frame = container.querySelector('iframe')
  expect(frame?.getAttribute('sandbox')).toBe('allow-same-origin')
  expect(frame?.getAttribute('title')).toBe('report.html')
  expect(frame?.getAttribute('srcdoc')).toContain('<base href="/raw/main/site/" target="_blank">')
})
