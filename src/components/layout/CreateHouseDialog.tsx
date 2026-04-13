import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useHousehold } from '@/context/HouseholdContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { friendlyError } from '@/lib/utils'
import { SUPPORTED_COUNTRIES } from '@/lib/mortgage-country'

interface CreateHouseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateHouseDialog({ open, onOpenChange }: CreateHouseDialogProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { createHouse } = useHousehold()
  const [houseName, setHouseName] = useState('')
  const [country, setCountry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset form state when dialog closes
  useEffect(() => {
    if (!open) {
      setHouseName('')
      setCountry('')
      setError('')
    }
  }, [open])

  const selectedCountry = SUPPORTED_COUNTRIES.find((c) => c.code === country)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!houseName.trim()) return
    setError('')
    setLoading(true)
    try {
      await createHouse(houseName.trim(), country || undefined, selectedCountry?.currency)
      onOpenChange(false)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.createNewHouse')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newHouseName">{t('onboarding.houseName')}</Label>
            <Input
              id="newHouseName"
              type="text"
              placeholder={t('onboarding.houseNamePlaceholder')}
              value={houseName}
              onChange={(e) => setHouseName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newHouseCountry">{t('onboarding.country')}</Label>
            <Select
              id="newHouseCountry"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">{t('onboarding.selectCountry')}</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </Select>
            {selectedCountry && (
              <p className="text-xs text-muted-foreground">
                {t('onboarding.currency', { code: selectedCountry.currency })}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || !houseName.trim()}>
            {loading ? t('common.creating') : t('onboarding.createHouse')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
