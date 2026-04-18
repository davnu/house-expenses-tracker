import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { Download, LogOut, Link, Copy, Check, Edit2, Users, AlertTriangle, Shield, Trash2, DoorOpen, Paperclip, Receipt, Home, Plus, Globe } from 'lucide-react'
import { friendlyError, cn } from '@/lib/utils'
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
import { useBudget } from '@/context/BudgetContext'
import { CreateHouseDialog } from '@/components/layout/CreateHouseDialog'
import { CostSharingCard } from '@/components/settings/CostSharingCard'
import { SUPPORTED_LANGUAGES } from '@/i18n'

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { expenses } = useExpenses()
  const { logout, deleteAccount } = useAuth()
  const { userProfile, house, houses, members, generateInvite, updateDisplayName, updateHouseName, removeMember, leaveHouse, deleteHouse } = useHousehold()
  const { mortgage } = useMortgage()
  const { budget } = useBudget()

  const HOUSE_DELETE_STEPS: CascadeStep[] = [
    { id: 'attachments', label: t('settings.removingFiles'), icon: Paperclip },
    { id: 'data', label: t('settings.clearingExpenses'), icon: Receipt },
    { id: 'members', label: t('settings.updatingMembers'), icon: Users },
    { id: 'finalize', label: t('settings.finalizing'), icon: Home },
  ]

  const ACCOUNT_DELETE_STEPS: CascadeStep[] = [
    { id: 'auth', label: t('settings.removingAuth'), icon: Shield },
    { id: 'houses', label: t('settings.deletingOwnedHouses'), icon: Home },
    { id: 'memberships', label: t('settings.cleaningMemberships'), icon: Users },
    { id: 'profile', label: t('settings.removingProfile'), icon: Trash2 },
  ]

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
      setInviteError(t('settings.failedToGenerateInvite'))
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
      setLeaveError(friendlyError(err))
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
      setDeleteHouseError(friendlyError(err))
      setDeleteHouseStep('idle')
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteStep('deleting')
    setDeleteError('')
    accountProgress.reset()
    try {
      await deleteAccount(accountProgress.onProgress)
    } catch (err) {
      setDeleteError(friendlyError(err))
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
      budget: budget ?? null,
      _note: 'File attachments are not included in this export due to size. Download them individually from the app.',
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `casatab-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.yourProfile')}</CardTitle>
          <CardDescription>{userProfile?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingName ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('settings.yourName')}
                autoFocus
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveName}>{t('common.save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">{t('common.name')}:</Label>
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
              <Label className="text-muted-foreground">{t('settings.housesLabel')}</Label>
              <span className="text-sm text-muted-foreground">
                {t('settings.memberOfHouseholds', { count: houses.length })}
              </span>
            </div>
          )}
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            {t('common.signOut')}
          </Button>
        </CardContent>
      </Card>

      {/* Household */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>{t('settings.household')}</CardTitle>
          </div>
          {houses.length > 1 && (
            <CardDescription>{t('settings.managing', { name: house?.name })}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* House name */}
          {editingHouse ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newHouseName}
                onChange={(e) => setNewHouseName(e.target.value)}
                placeholder={t('settings.houseName')}
                autoFocus
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveHouseName}>{t('common.save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingHouse(false)}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">{t('settings.houseLabel')}</Label>
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
            <Label className="text-muted-foreground mb-2 block">{t('settings.members')}</Label>
            <div className="space-y-2">
              {members.map((m) => {
                const isSelf = m.uid === userProfile?.uid
                const canRemove = isOwner && !isSelf

                return (
                  <div key={m.uid} className="flex items-start sm:items-center gap-2 group flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="text-sm font-medium truncate">{m.displayName}</span>
                      {m.role === 'owner' && <Badge variant="secondary" className="text-xs">{t('settings.owner')}</Badge>}
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
                            {t('common.confirm')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={() => setRemovingMemberId(null)}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          onClick={() => setRemovingMemberId(m.uid)}
                        >
                          {t('common.remove')}
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
                  {t('settings.leaveHousehold')}
                </Button>
              )}
              {leaveStep === 'confirm' && (
                <div className="space-y-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                  <p className="text-sm font-medium">{t('settings.leaveConfirm', { name: house?.name })}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.leaveWarning')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="destructive" onClick={handleLeaveHouse}>
                      {t('settings.leaveHousehold')}
                    </Button>
                    <Button variant="outline" onClick={() => setLeaveStep('idle')}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}
              {leaveStep === 'leaving' && (
                <p className="text-sm text-muted-foreground">{t('settings.leavingHousehold')}</p>
              )}
              {leaveError && <p className="text-sm text-destructive mt-2">{leaveError}</p>}
            </div>
          )}

          {/* Invite */}
          <div className="pt-2 border-t">
            <Label className="text-muted-foreground mb-2 block">{t('settings.inviteSomeone')}</Label>
            {inviteLink ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Input value={inviteLink} readOnly className="text-xs flex-1" />
                <Button size="sm" variant="outline" className="shrink-0" onClick={handleCopy}>
                  {copied ? <><Check className="h-4 w-4 mr-1.5" /> {t('settings.copied')}</> : <><Copy className="h-4 w-4 mr-1.5" /> {t('settings.copyLink')}</>}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleGenerateInvite} disabled={inviteLoading}>
                <Link className="h-4 w-4 mr-2" />
                {inviteLoading ? t('common.generating') : t('settings.generateInviteLink')}
              </Button>
            )}
            {inviteError && <p className="text-xs text-destructive mt-2">{inviteError}</p>}
            <p className="text-xs text-muted-foreground mt-2">
              {t('settings.inviteLinkExpiry')}
            </p>
          </div>

          {/* Create New House */}
          <div className="pt-2 border-t">
            <Button variant="ghost" onClick={() => setCreateHouseOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.createNewHouse')}
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t('settings.createNewHouseDesc')}
            </p>
            <CreateHouseDialog open={createHouseOpen} onOpenChange={setCreateHouseOpen} />
          </div>
        </CardContent>
      </Card>

      {/* Cost sharing — only relevant once there are multiple members */}
      <CostSharingCard />

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.dataPrivacy')}</CardTitle>
          <CardDescription>{t('settings.dataPrivacyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {t('settings.exportAllData')}
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t('settings.exportDesc')}
            </p>
          </div>
          <div className="pt-2 border-t">
            <RouterLink to="/privacy" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Shield className="h-3.5 w-3.5" />
              {t('common.privacyPolicy')}
            </RouterLink>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.statistics')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t('settings.expensesLabel')}</p>
              <p className="text-xl font-semibold">{expenses.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('settings.membersLabel')}</p>
              <p className="text-xl font-semibold">{members.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <CardTitle>{t('settings.language')}</CardTitle>
          </div>
          <CardDescription>{t('settings.languageDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => i18n.changeLanguage(lang.code)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer',
                  i18n.language.startsWith(lang.code)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent'
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Household — owner only */}
      {isOwner && (
        <Card className="border-destructive/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">{t('settings.deleteHousehold')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.deleteHouseholdDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deleteHouseStep === 'idle' && (
              <>
                <p className="text-sm text-muted-foreground">{t('settings.thisWillDelete')}</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>{t('settings.deleteExpenses', { count: expenses.length })}</li>
                  <li>{t('settings.deleteMortgageConfig')}</li>
                  <li>{t('settings.deleteMembers', { count: members.length })}</li>
                </ul>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteHouseStep('confirm')}
                >
                  {t('settings.deleteHouseName', { name: house?.name })}
                </Button>
              </>
            )}
            {deleteHouseStep === 'confirm' && (
              <div className="space-y-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-sm font-medium">{t('settings.typeHouseNameConfirm')}</p>
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
                    {t('settings.permanentlyDelete')}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setDeleteHouseStep('idle')
                    setDeleteHouseConfirmName('')
                  }}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
            {deleteHouseStep === 'deleting' && (
              <CascadeProgress
                steps={HOUSE_DELETE_STEPS}
                stepStates={houseProgress.stepStates}
                overallPercent={houseProgress.overallPercent}
                title={t('settings.deletingHouse', { name: house?.name })}
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
            <CardTitle className="text-destructive">{t('settings.deleteAccount')}</CardTitle>
          </div>
          <CardDescription>
            {t('settings.deleteAccountDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deleteStep === 'idle' && (
            <>
              <p className="text-sm text-muted-foreground">{t('settings.thisWillDelete')}</p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>{t('settings.deleteAccountList1')}</li>
                <li>{t('settings.deleteAccountList2')}</li>
                <li>{t('settings.deleteAccountList3')}</li>
                {houses.some((h) => h.ownerId === userProfile?.uid) && (
                  <li className="text-amber-600 font-medium">{t('settings.deleteAccountOwnedHouses')}</li>
                )}
              </ul>
              <Button
                variant="destructive"
                onClick={() => setDeleteStep('confirm')}
              >
                {t('settings.deleteMyAccount')}
              </Button>
            </>
          )}
          {deleteStep === 'confirm' && (
            <div className="space-y-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <p className="text-sm font-medium">{t('settings.deleteAccountConfirm')}</p>
              <p className="text-sm text-muted-foreground">
                {t('settings.deleteAccountExportFirst')}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="destructive" onClick={handleDeleteAccount}>
                  {t('settings.confirmDeleteAccount')}
                </Button>
                <Button variant="outline" onClick={() => setDeleteStep('idle')}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
          {deleteStep === 'deleting' && (
            <CascadeProgress
              steps={ACCOUNT_DELETE_STEPS}
              stepStates={accountProgress.stepStates}
              overallPercent={accountProgress.overallPercent}
              title={t('settings.deletingAccount')}
            />
          )}
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
