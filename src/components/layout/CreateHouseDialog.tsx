import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
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
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyError(err, 'Failed to create house. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New House</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newHouseName">House name</Label>
            <Input
              id="newHouseName"
              type="text"
              placeholder="e.g. 123 Main St or Our Place"
              value={houseName}
              onChange={(e) => setHouseName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newHouseCountry">Country</Label>
            <Select
              id="newHouseCountry"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">Select country...</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </Select>
            {selectedCountry && (
              <p className="text-xs text-muted-foreground">
                Currency: {selectedCountry.currency}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || !houseName.trim()}>
            {loading ? 'Creating...' : 'Create House'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
