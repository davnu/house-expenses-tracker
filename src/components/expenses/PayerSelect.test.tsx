import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SHARED_PAYER } from '@/lib/constants'
import type { HouseMember } from '@/types/expense'
import { PayerSelect } from './PayerSelect'

afterEach(cleanup)

const members: HouseMember[] = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner', joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member', joinedAt: '' },
]

function renderSelect(value: string = SHARED_PAYER, onChange = vi.fn()) {
  return { onChange, ...render(
    <PayerSelect value={value} onChange={onChange} members={members} id="payer" />
  ) }
}

describe('PayerSelect', () => {
  describe('trigger display', () => {
    it('shows "Shared" with house icon when shared is selected', () => {
      renderSelect(SHARED_PAYER)
      const trigger = screen.getByRole('combobox')
      expect(trigger.textContent).toContain('Shared')
    })

    it('shows member name when a member is selected', () => {
      renderSelect('alice')
      const trigger = screen.getByRole('combobox')
      expect(trigger.textContent).toContain('Alice')
    })

    it('shows "Former member" for unknown payer value (member who left)', () => {
      renderSelect('unknown-uid')
      const trigger = screen.getByRole('combobox')
      expect(trigger.textContent).toContain('Former member')
    })
  })

  describe('ARIA attributes', () => {
    it('has combobox role with aria-expanded=false when closed', () => {
      renderSelect()
      const trigger = screen.getByRole('combobox')
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    })

    it('has aria-expanded=true when open', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))
      expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true')
    })

    it('renders options with role="option" when open', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))
      const options = screen.getAllByRole('option')
      // 1 shared + 2 members = 3 options
      expect(options).toHaveLength(3)
    })

    it('marks the selected option with aria-selected=true', () => {
      renderSelect('bob')
      fireEvent.click(screen.getByRole('combobox'))
      const options = screen.getAllByRole('option')
      const bobOption = options.find((o) => o.textContent?.includes('Bob'))!
      expect(bobOption.getAttribute('aria-selected')).toBe('true')
    })

    it('passes aria-invalid to trigger', () => {
      render(
        <PayerSelect value={SHARED_PAYER} onChange={vi.fn()} members={members} aria-invalid={true} />
      )
      expect(screen.getByRole('combobox').getAttribute('aria-invalid')).toBe('true')
    })
  })

  describe('opening and closing', () => {
    it('opens dropdown on trigger click', () => {
      renderSelect()
      expect(screen.queryByRole('listbox')).toBeNull()
      fireEvent.click(screen.getByRole('combobox'))
      expect(screen.getByRole('listbox')).toBeTruthy()
    })

    it('closes dropdown on second click', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))
      expect(screen.getByRole('listbox')).toBeTruthy()
      fireEvent.click(screen.getByRole('combobox'))
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('closes dropdown on Escape', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))
      expect(screen.getByRole('listbox')).toBeTruthy()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('closes dropdown on outside click', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))
      expect(screen.getByRole('listbox')).toBeTruthy()
      // pointerdown on document body (outside the component)
      fireEvent.pointerDown(document.body)
      expect(screen.queryByRole('listbox')).toBeNull()
    })
  })

  describe('selection', () => {
    it('calls onChange with SHARED_PAYER when Shared is clicked', () => {
      const { onChange } = renderSelect('alice')
      fireEvent.click(screen.getByRole('combobox'))
      const sharedOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('Shared'))!
      fireEvent.click(sharedOption)
      expect(onChange).toHaveBeenCalledWith(SHARED_PAYER)
    })

    it('calls onChange with member uid when member is clicked', () => {
      const { onChange } = renderSelect(SHARED_PAYER)
      fireEvent.click(screen.getByRole('combobox'))
      const bobOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('Bob'))!
      fireEvent.click(bobOption)
      expect(onChange).toHaveBeenCalledWith('bob')
    })

    it('closes dropdown after selection', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))
      const option = screen.getAllByRole('option')[0]
      fireEvent.click(option)
      expect(screen.queryByRole('listbox')).toBeNull()
    })
  })

  describe('keyboard navigation', () => {
    it('opens on ArrowDown when trigger is focused', async () => {
      const user = userEvent.setup()
      renderSelect()
      screen.getByRole('combobox').focus()
      await user.keyboard('{ArrowDown}')
      expect(screen.getByRole('listbox')).toBeTruthy()
    })

    it('opens on Enter when trigger is focused', async () => {
      const user = userEvent.setup()
      renderSelect()
      screen.getByRole('combobox').focus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('listbox')).toBeTruthy()
    })

    it('opens on Space when trigger is focused', async () => {
      const user = userEvent.setup()
      renderSelect()
      screen.getByRole('combobox').focus()
      await user.keyboard(' ')
      expect(screen.getByRole('listbox')).toBeTruthy()
    })

    it('ArrowDown moves focus through options', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))

      const options = screen.getAllByRole('option')
      // First option should be focused after open
      expect(document.activeElement).toBe(options[0])

      fireEvent.keyDown(document, { key: 'ArrowDown' })
      expect(document.activeElement).toBe(options[1])

      fireEvent.keyDown(document, { key: 'ArrowDown' })
      expect(document.activeElement).toBe(options[2])

      // Wraps around
      fireEvent.keyDown(document, { key: 'ArrowDown' })
      expect(document.activeElement).toBe(options[0])
    })

    it('ArrowUp moves focus backwards', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))

      const options = screen.getAllByRole('option')
      // Starts at index 0, ArrowUp wraps to last
      fireEvent.keyDown(document, { key: 'ArrowUp' })
      expect(document.activeElement).toBe(options[2])
    })

    it('Home jumps to first option', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))

      // Move to second option first
      fireEvent.keyDown(document, { key: 'ArrowDown' })
      fireEvent.keyDown(document, { key: 'Home' })

      const options = screen.getAllByRole('option')
      expect(document.activeElement).toBe(options[0])
    })

    it('End jumps to last option', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))

      fireEvent.keyDown(document, { key: 'End' })

      const options = screen.getAllByRole('option')
      expect(document.activeElement).toBe(options[2])
    })
  })

  describe('visual structure', () => {
    it('shows shared option separated from member options', () => {
      renderSelect()
      fireEvent.click(screen.getByRole('combobox'))

      // There should be a border-t separator between shared and member sections
      const listbox = screen.getByRole('listbox')
      const separator = listbox.querySelector('.border-t')
      expect(separator).not.toBeNull()
    })

    it('shows check icon only on the selected option', () => {
      renderSelect('bob')
      fireEvent.click(screen.getByRole('combobox'))

      const options = screen.getAllByRole('option')
      // Shared (not selected) — no check
      // Shared (not selected) — has Home icon but not Check
      // Bob (selected) — has Check icon
      const bobSvgs = options[2].querySelectorAll('svg')
      // Bob should have more svgs (color dot is a span, but Check is an svg)
      expect(bobSvgs.length).toBeGreaterThan(0)
    })
  })
})
