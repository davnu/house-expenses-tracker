import { useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Home } from 'lucide-react'

export function OnboardingPage() {
  const { userProfile, createHouse } = useHousehold()
  const [houseName, setHouseName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!houseName.trim()) return
    setError('')
    setLoading(true)
    try {
      await createHouse(houseName.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create house')
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
            Give your house a name to get started. It can be the address, a nickname, anything you like.
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
