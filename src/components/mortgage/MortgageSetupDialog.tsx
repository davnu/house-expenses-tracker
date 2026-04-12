import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MortgageSetupForm } from './MortgageSetupForm'
import { useMortgage } from '@/context/MortgageContext'
import { friendlyError } from '@/lib/utils'
import type { MortgageConfig } from '@/types/mortgage'

interface MortgageSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MortgageSetupDialog({ open, onOpenChange }: MortgageSetupDialogProps) {
  const { mortgage, saveMortgage } = useMortgage()
  const [error, setError] = useState('')

  const handleSubmit = async (config: MortgageConfig) => {
    setError('')
    try {
      await saveMortgage(config)
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err, 'Failed to save mortgage. Please try again.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setError(''); onOpenChange(v) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mortgage ? 'Edit Mortgage' : 'Set Up Your Mortgage'}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <MortgageSetupForm defaultValues={mortgage} isEditing={!!mortgage} onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  )
}
