import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Paperclip, Users, Home } from 'lucide-react'
import { CascadeProgress } from './cascade-progress'
import type { CascadeStep, StepStatus } from '@/hooks/use-cascade-progress'

afterEach(cleanup)

const STEPS: CascadeStep[] = [
  { id: 'files', label: 'Removing files', icon: Paperclip },
  { id: 'members', label: 'Updating members', icon: Users },
  { id: 'finalize', label: 'Finalizing', icon: Home },
]

function makeStates(overrides: Partial<Record<string, StepStatus>> = {}): Record<string, StepStatus> {
  return {
    files: 'pending',
    members: 'pending',
    finalize: 'pending',
    ...overrides,
  }
}

describe('CascadeProgress', () => {
  it('renders all step labels', () => {
    render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates()}
        overallPercent={0}
      />,
    )

    expect(screen.getByText('Removing files')).toBeDefined()
    expect(screen.getByText('Updating members')).toBeDefined()
    expect(screen.getByText('Finalizing')).toBeDefined()
  })

  it('renders title when provided', () => {
    render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates()}
        overallPercent={0}
        title='Deleting "My House"...'
      />,
    )

    expect(screen.getByText('Deleting "My House"...')).toBeDefined()
  })

  it('does not render title when omitted', () => {
    render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates()}
        overallPercent={0}
      />,
    )

    expect(screen.queryByText(/Deleting/)).toBeNull()
  })

  it('applies line-through to completed steps', () => {
    render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates({ files: 'completed' })}
        overallPercent={33}
      />,
    )

    const completedLabel = screen.getByText('Removing files')
    expect(completedLabel.className).toContain('line-through')
  })

  it('applies font-medium to active steps', () => {
    render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates({ files: 'active' })}
        overallPercent={17}
      />,
    )

    const activeLabel = screen.getByText('Removing files')
    expect(activeLabel.className).toContain('font-medium')
  })

  it('shows percentage text in default variant', () => {
    render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates({ files: 'completed' })}
        overallPercent={33}
        variant="default"
      />,
    )

    expect(screen.getByText('33%')).toBeDefined()
  })

  it('renders the SVG progress ring', () => {
    const { container } = render(
      <CascadeProgress
        steps={STEPS}
        stepStates={makeStates()}
        overallPercent={50}
      />,
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })
})
