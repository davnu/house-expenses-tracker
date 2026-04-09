import { useState } from 'react'
import { Download, LogOut, Link, Copy, Check, Edit2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useExpenses } from '@/context/ExpenseContext'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'

export function SettingsPage() {
  const { expenses } = useExpenses()
  const { logout } = useAuth()
  const { userProfile, house, members, generateInvite, updateDisplayName, updateHouseName } = useHousehold()

  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(userProfile?.displayName ?? '')

  const [editingHouse, setEditingHouse] = useState(false)
  const [newHouseName, setNewHouseName] = useState(house?.name ?? '')

  const handleGenerateInvite = async () => {
    setInviteLoading(true)
    try {
      const link = await generateInvite()
      setInviteLink(link)
    } catch {
      // ignore
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

  const handleExport = () => {
    const data = {
      expenses,
      exportedAt: new Date().toISOString(),
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
            <p className="text-xs text-muted-foreground mt-2">
              The link expires in 7 days. Share it with anyone you want to join your household.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>Export your expense data as JSON</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
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
    </div>
  )
}
