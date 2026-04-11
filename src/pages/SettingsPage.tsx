import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { Download, LogOut, Link, Copy, Check, Edit2, Users, AlertTriangle, Shield } from 'lucide-react'
import { friendlyError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useExpenses } from '@/context/ExpenseContext'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import { useMortgage } from '@/context/MortgageContext'

export function SettingsPage() {
  const { expenses } = useExpenses()
  const { logout, deleteAccount } = useAuth()
  const { userProfile, house, members, generateInvite, updateDisplayName, updateHouseName } = useHousehold()
  const { mortgage } = useMortgage()

  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(userProfile?.displayName ?? '')

  const [editingHouse, setEditingHouse] = useState(false)
  const [newHouseName, setNewHouseName] = useState(house?.name ?? '')

  const [inviteError, setInviteError] = useState('')

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteError, setDeleteError] = useState('')

  const handleGenerateInvite = async () => {
    setInviteLoading(true)
    setInviteError('')
    try {
      const link = await generateInvite()
      setInviteLink(link)
    } catch {
      setInviteError('Failed to generate invite link. Please try again.')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveName = async () => {
    if (newName.trim()) {
      await updateDisplayName(newName.trim())
    }
    setEditingName(false)
  }

  const handleSaveHouseName = async () => {
    if (newHouseName.trim()) {
      await updateHouseName(newHouseName.trim())
    }
    setEditingHouse(false)
  }

  const handleDeleteAccount = async () => {
    setDeleteStep('deleting')
    setDeleteError('')
    try {
      await deleteAccount()
      // Auth state change will redirect to login
    } catch (err) {
      setDeleteError(friendlyError(err, 'Failed to delete account. Please try again.'))
      setDeleteStep('idle')
    }
  }

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: userProfile ? {
        displayName: userProfile.displayName,
        email: userProfile.email,
        createdAt: userProfile.createdAt,
      } : null,
      household: house ? {
        name: house.name,
        country: house.country,
        currency: house.currency,
        members: members.map((m) => ({
          displayName: m.displayName,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
      } : null,
      expenses: expenses.map((e) => ({
        ...e,
        attachments: e.attachments?.map((a) => ({
          name: a.name,
          type: a.type,
          size: a.size,
        })),
      })),
      mortgage: mortgage ?? null,
      _note: 'File attachments are not included in this export due to size. Download them individually from the app.',
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `house-expenses-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>{userProfile?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingName ? (
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveName}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">Name:</Label>
              <span className="font-medium">{userProfile?.displayName}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                setNewName(userProfile?.displayName ?? '')
                setEditingName(true)
              }}>
                <Edit2 className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Household */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Household</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* House name */}
          {editingHouse ? (
            <div className="flex gap-2">
              <Input
                value={newHouseName}
                onChange={(e) => setNewHouseName(e.target.value)}
                placeholder="House name"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveHouseName}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingHouse(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">House:</Label>
              <span className="font-medium">{house?.name}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                setNewHouseName(house?.name ?? '')
                setEditingHouse(true)
              }}>
                <Edit2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Members */}
          <div>
            <Label className="text-muted-foreground mb-2 block">Members</Label>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.uid} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="text-sm font-medium">{m.displayName}</span>
                  <span className="text-xs text-muted-foreground">{m.email}</span>
                  {m.role === 'owner' && <Badge variant="secondary" className="text-xs">Owner</Badge>}
                </div>
              ))}
            </div>
          </div>

          {/* Invite */}
          <div className="pt-2 border-t">
            <Label className="text-muted-foreground mb-2 block">Invite someone</Label>
            {inviteLink ? (
              <div className="flex gap-2">
                <Input value={inviteLink} readOnly className="text-xs" />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleGenerateInvite} disabled={inviteLoading}>
                <Link className="h-4 w-4 mr-2" />
                {inviteLoading ? 'Generating...' : 'Generate Invite Link'}
              </Button>
            )}
            {inviteError && <p className="text-xs text-destructive mt-2">{inviteError}</p>}
            <p className="text-xs text-muted-foreground mt-2">
              The link expires in 7 days. Share it with anyone you want to join your household.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle>Data & Privacy</CardTitle>
          <CardDescription>Your data belongs to you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export All My Data
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              Download your profile, expenses, mortgage, and household data as JSON.
            </p>
          </div>
          <div className="pt-2 border-t">
            <RouterLink to="/privacy" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Shield className="h-3.5 w-3.5" />
              Privacy Policy
            </RouterLink>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Expenses</p>
              <p className="text-xl font-semibold">{expenses.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Members</p>
              <p className="text-xl font-semibold">{members.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Delete Account</CardTitle>
          </div>
          <CardDescription>
            Permanently delete your account and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deleteStep === 'idle' && (
            <>
              <p className="text-sm text-muted-foreground">This will delete:</p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Your user profile and authentication</li>
                <li>Your expenses and their attachments</li>
                <li>Your membership from the household</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Shared household data (other members' expenses, mortgage settings) will not be affected.
              </p>
              <Button
                variant="destructive"
                onClick={() => setDeleteStep('confirm')}
              >
                Delete my account
              </Button>
            </>
          )}
          {deleteStep === 'confirm' && (
            <div className="space-y-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <p className="text-sm font-medium">Are you sure? This action is permanent and cannot be reversed.</p>
              <p className="text-sm text-muted-foreground">
                We recommend exporting your data first using the button above.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDeleteAccount}>
                  Yes, permanently delete my account
                </Button>
                <Button variant="outline" onClick={() => setDeleteStep('idle')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {deleteStep === 'deleting' && (
            <p className="text-sm text-muted-foreground">Deleting your account...</p>
          )}
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
