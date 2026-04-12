import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { Download, LogOut, Link, Copy, Check, Edit2, Users, AlertTriangle, Shield, Trash2, DoorOpen, Paperclip, Receipt, Home, Plus } from 'lucide-react'
import { friendlyError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CascadeProgress } from '@/components/ui/cascade-progress'
import { useCascadeProgress, type CascadeStep } from '@/hooks/use-cascade-progress'
import { useExpenses } from '@/context/ExpenseContext'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import { useMortgage } from '@/context/MortgageContext'
import { CreateHouseDialog } from '@/components/layout/CreateHouseDialog'

const HOUSE_DELETE_STEPS: CascadeStep[] = [
  { id: 'attachments', label: 'Removing files', icon: Paperclip },
  { id: 'data', label: 'Clearing expenses & data', icon: Receipt },
  { id: 'members', label: 'Updating members', icon: Users },
  { id: 'finalize', label: 'Finalizing', icon: Home },
]

const ACCOUNT_DELETE_STEPS: CascadeStep[] = [
  { id: 'auth', label: 'Removing authentication', icon: Shield },
  { id: 'houses', label: 'Deleting owned houses', icon: Home },
  { id: 'memberships', label: 'Cleaning up memberships', icon: Users },
  { id: 'profile', label: 'Removing profile', icon: Trash2 },
]

export function SettingsPage() {
  const { expenses } = useExpenses()
  const { logout, deleteAccount } = useAuth()
  const { userProfile, house, houses, members, generateInvite, updateDisplayName, updateHouseName, removeMember, leaveHouse, deleteHouse } = useHousehold()
  const { mortgage } = useMortgage()

  const houseProgress = useCascadeProgress(HOUSE_DELETE_STEPS)
  const accountProgress = useCascadeProgress(ACCOUNT_DELETE_STEPS)

  const [createHouseOpen, setCreateHouseOpen] = useState(false)

  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(userProfile?.displayName ?? '')

  const [editingHouse, setEditingHouse] = useState(false)
  const [newHouseName, setNewHouseName] = useState(house?.name ?? '')

  const [inviteError, setInviteError] = useState('')

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  const [leaveStep, setLeaveStep] = useState<'idle' | 'confirm' | 'leaving'>('idle')
  const [leaveError, setLeaveError] = useState('')

  const [deleteHouseStep, setDeleteHouseStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteHouseConfirmName, setDeleteHouseConfirmName] = useState('')
  const [deleteHouseError, setDeleteHouseError] = useState('')

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteError, setDeleteError] = useState('')

  const isOwner = house?.ownerId === userProfile?.uid

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

  const handleLeaveHouse = async () => {
    setLeaveStep('leaving')
    setLeaveError('')
    try {
      await leaveHouse()
    } catch (err) {
      setLeaveError(friendlyError(err, 'Failed to leave household. Please try again.'))
      setLeaveStep('idle')
    }
  }

  const handleDeleteHouse = async () => {
    setDeleteHouseStep('deleting')
    setDeleteHouseError('')
    houseProgress.reset()
    try {
      await deleteHouse(houseProgress.onProgress)
    } catch (err) {
      setDeleteHouseError(friendlyError(err, 'Failed to delete household. Please try again.'))
      setDeleteHouseStep('idle')
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteStep('deleting')
    setDeleteError('')
    accountProgress.reset()
    try {
      await deleteAccount(accountProgress.onProgress)
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
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your name"
                autoFocus
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveName}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
              </div>
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
          {houses.length > 1 && (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">Houses:</Label>
              <span className="text-sm text-muted-foreground">
                Member of {houses.length} households
              </span>
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
          {houses.length > 1 && (
            <CardDescription>Managing: {house?.name}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* House name */}
          {editingHouse ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newHouseName}
                onChange={(e) => setNewHouseName(e.target.value)}
                placeholder="House name"
                autoFocus
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveHouseName}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingHouse(false)}>Cancel</Button>
              </div>
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
              {members.map((m) => {
                const isSelf = m.uid === userProfile?.uid
                const canRemove = isOwner && !isSelf

                return (
                  <div key={m.uid} className="flex items-start sm:items-center gap-2 group flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="text-sm font-medium truncate">{m.displayName}</span>
                      {m.role === 'owner' && <Badge variant="secondary" className="text-xs">Owner</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{m.email}</span>
                    {canRemove && (
                      removingMemberId === m.uid ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 text-xs px-2"
                            onClick={async () => {
                              await removeMember(m.uid)
                              setRemovingMemberId(null)
                            }}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={() => setRemovingMemberId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          onClick={() => setRemovingMemberId(m.uid)}
                        >
                          Remove
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leave Household — non-owners only */}
          {!isOwner && (
            <div className="pt-2 border-t">
              {leaveStep === 'idle' && (
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setLeaveStep('confirm')}>
                  <DoorOpen className="h-4 w-4 mr-2" />
                  Leave Household
                </Button>
              )}
              {leaveStep === 'confirm' && (
                <div className="space-y-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                  <p className="text-sm font-medium">Leave "{house?.name}"?</p>
                  <p className="text-sm text-muted-foreground">
                    You will lose access to all expenses and data in this household. This cannot be undone.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="destructive" onClick={handleLeaveHouse}>
                      Leave Household
                    </Button>
                    <Button variant="outline" onClick={() => setLeaveStep('idle')}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {leaveStep === 'leaving' && (
                <p className="text-sm text-muted-foreground">Leaving household...</p>
              )}
              {leaveError && <p className="text-sm text-destructive mt-2">{leaveError}</p>}
            </div>
          )}

          {/* Invite */}
          <div className="pt-2 border-t">
            <Label className="text-muted-foreground mb-2 block">Invite someone</Label>
            {inviteLink ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Input value={inviteLink} readOnly className="text-xs flex-1" />
                <Button size="sm" variant="outline" className="shrink-0" onClick={handleCopy}>
                  {copied ? <><Check className="h-4 w-4 mr-1.5" /> Copied</> : <><Copy className="h-4 w-4 mr-1.5" /> Copy link</>}
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

          {/* Create New House */}
          <div className="pt-2 border-t">
            <Button variant="ghost" onClick={() => setCreateHouseOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create New House
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              Track expenses for another property separately.
            </p>
            <CreateHouseDialog open={createHouseOpen} onOpenChange={setCreateHouseOpen} />
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

      {/* Delete Household — owner only */}
      {isOwner && (
        <Card className="border-destructive/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">Delete Household</CardTitle>
            </div>
            <CardDescription>
              Permanently delete this household and all associated data. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deleteHouseStep === 'idle' && (
              <>
                <p className="text-sm text-muted-foreground">This will delete:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>All {expenses.length} expense{expenses.length !== 1 ? 's' : ''} and their attachments</li>
                  <li>Mortgage configuration and history</li>
                  <li>All {members.length} member{members.length !== 1 ? 's' : ''} will lose access</li>
                </ul>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteHouseStep('confirm')}
                >
                  Delete "{house?.name}"
                </Button>
              </>
            )}
            {deleteHouseStep === 'confirm' && (
              <div className="space-y-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-sm font-medium">Type the house name to confirm deletion:</p>
                <Input
                  value={deleteHouseConfirmName}
                  onChange={(e) => setDeleteHouseConfirmName(e.target.value)}
                  placeholder={house?.name}
                  autoFocus
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteHouse}
                    disabled={deleteHouseConfirmName !== house?.name}
                  >
                    Permanently Delete
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setDeleteHouseStep('idle')
                    setDeleteHouseConfirmName('')
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {deleteHouseStep === 'deleting' && (
              <CascadeProgress
                steps={HOUSE_DELETE_STEPS}
                stepStates={houseProgress.stepStates}
                overallPercent={houseProgress.overallPercent}
                title={`Deleting "${house?.name}"...`}
                variant="house-delete"
              />
            )}
            {deleteHouseError && <p className="text-sm text-destructive">{deleteHouseError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Danger Zone — Delete Account */}
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
                <li>Your membership from all households</li>
                {houses.some((h) => h.ownerId === userProfile?.uid) && (
                  <li className="text-amber-600 font-medium">All houses you own will be permanently deleted for all members</li>
                )}
              </ul>
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
              <div className="flex flex-col sm:flex-row gap-2">
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
            <CascadeProgress
              steps={ACCOUNT_DELETE_STEPS}
              stepStates={accountProgress.stepStates}
              overallPercent={accountProgress.overallPercent}
              title="Deleting your account..."
            />
          )}
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
