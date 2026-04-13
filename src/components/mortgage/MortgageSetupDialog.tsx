import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { mortgage, saveMortgage } = useMortgage()
  const [error, setError] = useState('')

  const handleSubmit = async (config: MortgageConfig) => {
    setError('')
    try {
      await saveMortgage(config)
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setError(''); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mortgage ? t('mortgage.updateMortgage') : t('mortgage.setUpMortgageBtn')}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <MortgageSetupForm defaultValues={mortgage} isEditing={!!mortgage} onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  )
}
