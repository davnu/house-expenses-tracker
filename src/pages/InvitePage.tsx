import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/data/firebase'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoginPage } from './LoginPage'
import { Home, UserPlus, AlertCircle } from 'lucide-react'
import type { Invite } from '@/types/expense'

export function InvitePage() {
  const { inviteId } = useParams<{ inviteId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { userProfile, joinHouse, loading: householdLoading } = useHousehold()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  // Load invite details
  useEffect(() => {
    if (!inviteId) return
    getDoc(doc(db, 'invites', inviteId)).then((snap) => {
      if (snap.exists()) {
        setInvite({ id: snap.id, ...snap.data() } as Invite)
      }
      setLoadingInvite(false)
    })
  }, [inviteId])

  // Auto-join when user is logged in, has profile, but no house
  useEffect(() => {
    if (!user || !userProfile || householdLoading || !invite) return
    if (userProfile.houseId) return // already in a house
    if (joining) return

    handleJoin()
  }, [user, userProfile, householdLoading, invite, inviteId])

  const handleJoin = async () => {
    if (!inviteId || joining) return
    setJoining(true)
    setError('')
    try {
      await joinHouse(inviteId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
      setJoining(false)
    }
  }

  // Loading state
  if (loadingInvite || householdLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Invalid invite
  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-destructive" />
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>This invite link is invalid or has been removed.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Expired invite
  if (new Date(invite.expiresAt) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Invite Expired</CardTitle>
            <CardDescription>This invite link has expired. Ask the house owner for a new one.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Already used
  if (invite.usedBy) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Invite Already Used</CardTitle>
            <CardDescription>This invite has already been accepted.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Not logged in — show login form with invite context
  if (!user) {
    return <LoginPage subtitle={`Sign in or sign up to join "${invite.houseName}"`} />
  }

  // User already has a house
  if (userProfile?.houseId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Home className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Already in a Household</CardTitle>
            <CardDescription>
              You're already part of a household. You can only be in one at a time.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/', { replace: true })}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Joining state
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <UserPlus className="h-10 w-10 mx-auto mb-2 text-primary" />
          <CardTitle>Join {invite.houseName}</CardTitle>
          <CardDescription>You've been invited to join this household.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button className="w-full" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining...' : 'Join Household'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
