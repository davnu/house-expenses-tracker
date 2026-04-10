import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MortgageSetupForm } from './MortgageSetupForm'
import { useMortgage } from '@/context/MortgageContext'
import type { MortgageConfig } from '@/types/mortgage'

interface MortgageSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MortgageSetupDialog({ open, onOpenChange }: MortgageSetupDialogProps) {
  const { mortgage, saveMortgage } = useMortgage()

  const handleSubmit = async (config: MortgageConfig) => {
    // Context handles auto-population of rate periods for variable mortgages
    await saveMortgage(config)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mortgage ? 'Edit Mortgage' : 'Set Up Your Mortgage'}</DialogTitle>
        </DialogHeader>
        <MortgageSetupForm defaultValues={mortgage} onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  )
}
