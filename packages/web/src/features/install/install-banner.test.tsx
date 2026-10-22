import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { InstallBanner } from './install-banner'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const displayMode = (standalone: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    query =>
      ({
        matches: standalone && query === '(display-mode: standalone)',
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  )

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('iOS browser gets the guide, and dismissing it sticks', () => {
  displayMode(false)
  render(<InstallBanner />)
  fireEvent.click(screen.getByRole('button', { name: '怎么添加' }))
  expect(screen.getByRole('heading', { name: '添加到主屏幕' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '不再提示' }))
  expect(screen.queryByRole('region', { name: '安装 baton' })).toBeNull()
  cleanup()
  render(<InstallBanner />)
  expect(screen.queryByRole('region', { name: '安装 baton' })).toBeNull()
})

test('home-screen app shows no banner', () => {
  displayMode(true)
  render(<InstallBanner />)
  expect(screen.queryByRole('region', { name: '安装 baton' })).toBeNull()
})
