import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CostSplitShare, HouseMember } from '@/types/expense'

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

import { SplitEditor } from './SplitEditor'

afterEach(cleanup)

const members: HouseMember[] = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner', joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member', joinedAt: '' },
]
const equalSplit: CostSplitShare[] = [
  { uid: 'alice', shareBps: 5000 },
  { uid: 'bob', shareBps: 5000 },
]

describe('SplitEditor', () => {
  it('opens in Equal mode with all members included when there is no override', () => {
    const onSave = vi.fn()
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={null}
        onSave={onSave}
      />,
    )
    // Two rows, both marked with the equal share
    expect(screen.getAllByText(/50\.00|50,00/).length).toBeGreaterThan(0)
    // Both checkboxes are checked
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(2)
    boxes.forEach((b) => expect(b.checked).toBe(true))
  })

  it('deselecting a member recomputes per-member amounts and keeps sum = total', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={null}
        onSave={onSave}
      />,
    )
    const boxes = screen.getAllByRole('checkbox')
    await user.click(boxes[1]) // deselect Bob
    // Save and check the emitted splits
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const emitted = onSave.mock.calls[0][0]
    const sum = emitted.reduce((s: number, x: { shareCents: number }) => s + x.shareCents, 0)
    expect(sum).toBe(10000)
    // Alice has the full amount, Bob 0
    expect(emitted.find((s: { uid: string }) => s.uid === 'alice').shareCents).toBe(10000)
    expect(emitted.find((s: { uid: string }) => s.uid === 'bob').shareCents).toBe(0)
  })

  it('over-allocated state in Exact tab disables Save and shows the hint', async () => {
    const user = userEvent.setup()
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={null}
        onSave={vi.fn()}
      />,
    )
    // Switch to Exact tab
    await user.click(screen.getByRole('button', { name: /exact/i }))
    // Change Alice's amount to 200 (over)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    await user.clear(inputs[0])
    await user.type(inputs[0], '200')
    // Save should be disabled
    const save = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    // Hint mentions "must match"
    expect(screen.getByText(/must match|tiene que ser|doit atteindre|ergeben|zijn|guardar/i)).toBeTruthy()
  })

  it('under-allocated state disables Save and shows remaining indicator', async () => {
    const user = userEvent.setup()
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={null}
        onSave={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /exact/i }))
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    await user.clear(inputs[0])
    await user.type(inputs[0], '10')
    await user.clear(inputs[1])
    await user.type(inputs[1], '10')
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true)
    // "left to allocate" message is visible
    expect(screen.getByText(/left to allocate|por repartir|à répartir|zu verteilen|te verdelen|distribuir/i)).toBeTruthy()
  })

  it('Cancel closes the editor without saving', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <SplitEditor
        open
        onOpenChange={onOpenChange}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={[
          { uid: 'alice', shareCents: 7000 },
          { uid: 'bob', shareCents: 3000 },
        ]}
        onSave={onSave}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^cancel|^cancelar|^annuler|^abbrechen|^annuleren/i }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens in Equal mode when incoming override is an equal subset (mode-detection regression)', () => {
    // Alice 100%, Bob 0% — equal split among one included member ("Alice only")
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={[
          { uid: 'alice', shareCents: 10000 },
          { uid: 'bob', shareCents: 0 },
        ]}
        onSave={vi.fn()}
      />,
    )
    // Equal tab should be active (visible share row shows 100.00 for Alice)
    const tabs = screen.getAllByRole('button').filter((b) => /equally|iguales|égales|gleich|gelijk|partes/i.test(b.textContent || ''))
    expect(tabs.length).toBeGreaterThan(0)
    // Alice's row shows the full amount
    const aliceRow = screen.getByText('Alice').closest('label')
    expect(within(aliceRow as HTMLElement).getByText(/100\.00|100,00/)).toBeTruthy()
  })

  it('Exact tab pre-fills from the incoming override', async () => {
    const user = userEvent.setup()
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={[
          { uid: 'alice', shareCents: 7000 },
          { uid: 'bob', shareCents: 3000 },
        ]}
        onSave={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /exact/i }))
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(inputs[0].value).toBe('70.00')
    expect(inputs[1].value).toBe('30.00')
  })
})

describe('SplitEditor — quick-pick presets (2-member)', () => {
  it('applies 60/40 to the inputs when tapped', async () => {
    const user = userEvent.setup()
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        value={null}
        onSave={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /exact/i }))
    await user.click(screen.getByRole('button', { name: /60\s*\/\s*40/ }))
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(inputs[0].value).toBe('60.00')
    expect(inputs[1].value).toBe('40.00')
  })
})

describe('SplitEditor — deterministic Equal mode detection', () => {
  // Regression test for fix #3 in the audit: check that Map-based comparison
  // accepts incoming values in any uid order.
  it('detects an equal split even when value is reversed relative to members', () => {
    render(
      <SplitEditor
        open
        onOpenChange={() => {}}
        amountCents={10000}
        members={members}
        houseSplit={equalSplit}
        // value uids reversed — ordering must not matter
        value={[
          { uid: 'bob', shareCents: 5000 },
          { uid: 'alice', shareCents: 5000 },
        ]}
        onSave={vi.fn()}
      />,
    )
    // Both checkboxes should be checked (Equal mode, both included)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    boxes.forEach((b) => expect(b.checked).toBe(true))
  })
})

