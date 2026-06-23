import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { AddWorker } from './add-worker'

afterEach(cleanup)

const renderAddWorker = () => {
  const mintToken = vi.fn(async () => ({ token: 'tok-abc123' }))
  const api = {
    auth: { me: vi.fn(async () => ({ hasToken: false })), mintToken },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <AddWorker projectId={42} onClose={vi.fn()} />
    </ApiContext.Provider>,
  )
  return { mintToken }
}

test('add-worker guide shows pre-filled commands + mints a token on demand', async () => {
  const { mintToken } = renderAddWorker()
  // Install + register/run commands are pre-filled with this project + the server URL.
  expect(screen.getByText('npm i -g @lesscap/baton-cli')).toBeTruthy()
  expect(screen.getByText(/baton worker register .+ --project 42$/)).toBeTruthy()
  expect(screen.getByText('baton worker run')).toBeTruthy()
  // The token is minted only on demand, then surfaced as the export line.
  expect(mintToken).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Generate token'))
  expect(mintToken).toHaveBeenCalled()
  expect(await screen.findByText('export BATON_TOKEN=tok-abc123')).toBeTruthy()
})
