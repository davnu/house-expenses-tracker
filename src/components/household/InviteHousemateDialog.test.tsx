import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

const { generateInviteMock } = vi.hoisted(() => ({
  generateInviteMock: vi.fn(),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    generateInvite: generateInviteMock,
    house: { id: 'h1', name: 'Casa Verde' },
  }),
}))

import { InviteHousemateDialog } from './InviteHousemateDialog'

const writeTextMock = vi.fn()
const shareMock = vi.fn()

afterEach(() => {
  cleanup()
  generateInviteMock.mockReset()
  writeTextMock.mockReset()
  shareMock.mockReset()
  // Strip navigator.share between tests so each one opts in explicitly
  if ('share' in navigator) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  }
})

function setup(open = true) {
  const onOpenChange = vi.fn()
  const utils = render(<InviteHousemateDialog open={open} onOpenChange={onOpenChange} />)
  return { ...utils, onOpenChange }
}

beforeEach(() => {
  writeTextMock.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeTextMock },
  })
})

describe('InviteHousemateDialog — lazy generation', () => {
  it('does not call generateInvite while closed', () => {
    setup(false)
    expect(generateInviteMock).not.toHaveBeenCalled()
  })

  it('does not call generateInvite when opened — waits for user intent', async () => {
    setup(true)
    expect(await screen.findByRole('button', { name: /create invite link/i })).toBeTruthy()
    expect(generateInviteMock).not.toHaveBeenCalled()
  })

  it('clicking the Generate button creates the link and reveals copy controls', async () => {
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    expect(await screen.findByDisplayValue('https://example.com/invite/abc')).toBeTruthy()
    expect(generateInviteMock).toHaveBeenCalledOnce()
    // Generate button is gone after success
    expect(screen.queryByRole('button', { name: /create invite link/i })).toBeNull()
  })

  it('shows a preparing state while the request is in flight', async () => {
    let resolve: (value: string) => void = () => {}
    generateInviteMock.mockImplementation(
      () => new Promise<string>((r) => { resolve = r }),
    )
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    expect(await screen.findByText(/preparing/i)).toBeTruthy()
    resolve('https://example.com/invite/x')
    await waitFor(() => expect(screen.queryByText(/preparing/i)).toBeNull())
  })
})

describe('InviteHousemateDialog — copy + share actions', () => {
  it('copies the link when the copy button is clicked and shows a transient confirmation', async () => {
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/abc')
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('https://example.com/invite/abc'))
    expect(await screen.findByText(/copied/i)).toBeTruthy()
  })

  it('does not crash when clipboard write rejects', async () => {
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    writeTextMock.mockRejectedValue(new Error('blocked'))
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/abc')
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    await waitFor(() => expect(writeTextMock).toHaveBeenCalled())
    // Link still visible so the user can copy manually
    expect(screen.getByDisplayValue('https://example.com/invite/abc')).toBeTruthy()
  })

  it('renders a Share button only when navigator.share is available', async () => {
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/abc')
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull()
  })

  it('Share button calls navigator.share with house name and URL', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: shareMock })
    shareMock.mockResolvedValue(undefined)
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/abc')
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }))
    await waitFor(() => expect(shareMock).toHaveBeenCalled())
    const arg = shareMock.mock.calls[0][0]
    expect(arg.url).toBe('https://example.com/invite/abc')
    expect(arg.title).toBe('Casa Verde')
    expect(arg.text).toContain('Casa Verde')
  })

  it('does not crash when the user cancels the native share sheet', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: shareMock })
    shareMock.mockRejectedValue(new DOMException('Share canceled', 'AbortError'))
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/abc')
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }))
    await waitFor(() => expect(shareMock).toHaveBeenCalled())
    expect(screen.getByDisplayValue('https://example.com/invite/abc')).toBeTruthy()
  })
})

describe('InviteHousemateDialog — error & retry', () => {
  it('shows an error and retry button when generateInvite fails', async () => {
    generateInviteMock.mockRejectedValue(new Error('network'))
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    expect(await screen.findByText(/failed to generate invite/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('retry button re-attempts the request and recovers', async () => {
    generateInviteMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('https://example.com/invite/recovered')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByText(/failed to generate invite/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByDisplayValue('https://example.com/invite/recovered')).toBeTruthy()
    expect(generateInviteMock).toHaveBeenCalledTimes(2)
  })
})

describe('InviteHousemateDialog — race conditions & state cleanup', () => {
  it('reopening shows a fresh Generate button, never a stale link from a prior open', async () => {
    generateInviteMock.mockResolvedValueOnce('https://example.com/invite/first')
    const onOpenChange = vi.fn()
    const { rerender } = render(<InviteHousemateDialog open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/first')

    rerender(<InviteHousemateDialog open={false} onOpenChange={onOpenChange} />)
    rerender(<InviteHousemateDialog open={true} onOpenChange={onOpenChange} />)

    // No stale link. User has to click Generate again to get a new one.
    expect(await screen.findByRole('button', { name: /create invite link/i })).toBeTruthy()
    expect(screen.queryByDisplayValue('https://example.com/invite/first')).toBeNull()
    // generateInvite was called exactly once — closing/reopening did not produce extra Firestore docs
    expect(generateInviteMock).toHaveBeenCalledTimes(1)
  })

  it('discards stale generation results when the dialog closes mid-request', async () => {
    let resolveFirst: (value: string) => void = () => {}
    generateInviteMock
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveFirst = r }))
      .mockResolvedValueOnce('https://example.com/invite/second')

    const onOpenChange = vi.fn()
    const { rerender } = render(<InviteHousemateDialog open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    // While first request is in flight, close the dialog
    rerender(<InviteHousemateDialog open={false} onOpenChange={onOpenChange} />)
    // Now resolve the (now-stale) first request — its result must NOT show on reopen
    resolveFirst('https://example.com/invite/STALE')
    // Reopen and trigger a fresh generation
    rerender(<InviteHousemateDialog open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    expect(await screen.findByDisplayValue('https://example.com/invite/second')).toBeTruthy()
    // Stale value must not have leaked into state
    expect(screen.queryByDisplayValue('https://example.com/invite/STALE')).toBeNull()
  })

  it('shows the expiry/use note alongside the link', async () => {
    generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: /create invite link/i }))
    await screen.findByDisplayValue('https://example.com/invite/abc')
    expect(screen.getByText(/7 days/i)).toBeTruthy()
  })
})
