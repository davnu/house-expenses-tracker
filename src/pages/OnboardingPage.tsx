import { useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Home } from 'lucide-react'
import { friendlyError } from '@/lib/utils'
import { SUPPORTED_COUNTRIES } from '@/lib/mortgage-country'

export function OnboardingPage() {
  const { userProfile, createHouse } = useHousehold()
  const [houseName, setHouseName] = useState('')
  const [country, setCountry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedCountry = SUPPORTED_COUNTRIES.find((c) => c.code === country)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!houseName.trim()) return
    setError('')
    setLoading(true)
    try {
      await createHouse(
        houseName.trim(),
        country || undefined,
        selectedCountry?.currency
      )
    } catch (err) {
      setError(friendlyError(err, 'Failed to create house. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <Home className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">
            Welcome{userProfile?.displayName ? `, ${userProfile.displayName}` : ''}!
          </CardTitle>
          <CardDescription>
            Set up your house to start tracking expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="houseName">House name</Label>
              <Input
                id="houseName"
                type="text"
                placeholder="e.g. 123 Main St or Our Place"
                value={houseName}
                onChange={(e) => setHouseName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select
                id="country"
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
        </CardContent>
      </Card>
    </div>
  )
}
