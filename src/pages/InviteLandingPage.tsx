import { useState, useEffect } from 'react'
import { useParams } from 'react-router'
import { doc, getDoc } from 'firebase/firestore'
import { useTranslation } from 'react-i18next'
import { db } from '@/data/firebase'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoginPage } from './LoginPage'
import { AlertCircle, UserPlus } from 'lucide-react'
import { LoadingScreen } from '@/components/ui/loading'
import type { Invite } from '@/types/expense'

export function InviteLandingPage() {
  const { t } = useTranslation()
  const { inviteId } = useParams<{ inviteId: string }>()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!inviteId) return
    getDoc(doc(db, 'invites', inviteId))
      .then((snap) => {
        if (snap.exists()) {
          setInvite({ id: snap.id, ...snap.data() } as Invite)
        }
      })
      .catch(() => {
        // Permission denied or network error
      })
      .finally(() => setLoading(false))
  }, [inviteId])

  if (loading) return <LoadingScreen />

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-destructive" />
            <CardTitle>{t('invite.invalidInvite')}</CardTitle>
            <CardDescription>{t('invite.invalidInviteDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>{t('invite.inviteExpired')}</CardTitle>
            <CardDescription>{t('invite.inviteExpiredDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (invite.usedBy) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <UserPlus className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>{t('invite.inviteAlreadyUsed')}</CardTitle>
            <CardDescription>{t('invite.inviteAlreadyUsedDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return <LoginPage subtitle={t('invite.signInToJoin', { houseName: invite.houseName })} />
}
