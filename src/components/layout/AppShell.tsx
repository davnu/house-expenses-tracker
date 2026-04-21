import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Link, Outlet, useNavigate } from 'react-router'
import { LayoutDashboard, Landmark, Receipt, Settings, LogOut, FolderOpen, Shield, ChevronDown, Plus, Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import { useCanCreateHouse } from '@/hooks/use-can-create-house'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { Button } from '@/components/ui/button'
import { HouseSwitcher } from './HouseSwitcher'
import { CreateHouseDialog } from './CreateHouseDialog'

function MobileHouseBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { house, houses, switchHouse } = useHousehold()
  const { canCreate: canCreateHouse } = useCanCreateHouse()
  const { open: openUpgrade } = useUpgradeDialog()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const handleSwitch = async (houseId: string) => {
    if (houseId === house?.id) {
      setOpen(false)
      return
    }
    setSwitching(true)
    try {
      await switchHouse(houseId)
      setOpen(false)
      navigate('/app', { replace: true })
    } catch {
      setOpen(false)
    } finally {
      setSwitching(false)
    }
  }

  if (houses.length <= 1) return null

  return (
    <div className="lg:hidden print:!hidden relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold w-full border-b bg-card cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{house?.name ?? t('common.houseExpenses')}</span>
        <ChevronDown className={cn(
          'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
          open && 'rotate-180',
          switching && 'animate-pulse'
        )} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[45]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label={t('common.houseExpenses')}
            className="absolute left-2 right-2 top-full z-50 mt-0.5 rounded-lg border bg-card shadow-lg overflow-hidden"
          >
            <div className="py-1">
              {houses.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  role="option"
                  aria-selected={h.id === house?.id}
                  disabled={switching}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer',
                    h.id === house?.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-accent text-foreground',
                    switching && 'opacity-50 pointer-events-none'
                  )}
                  onClick={() => handleSwitch(h.id)}
                >
                  <span className="truncate flex-1">{h.name}</span>
                  {h.id === house?.id && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="border-t py-1">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                onClick={() => {
                  setOpen(false)
                  if (!canCreateHouse) {
                    openUpgrade('create_house')
                    return
                  }
                  setCreateOpen(true)
                }}
              >
                {canCreateHouse ? (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{t('settings.createNewHouse')}</span>
              </button>
            </div>
          </div>
        </>
      )}

      <CreateHouseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

export function AppShell() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const { userProfile } = useHousehold()

  const navItems = [
    { to: '/app', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/app/mortgage', icon: Landmark, label: t('nav.mortgage') },
    { to: '/app/expenses', icon: Receipt, label: t('nav.expenses') },
    { to: '/app/documents', icon: FolderOpen, label: t('nav.documents') },
    { to: '/app/settings', icon: Settings, label: t('nav.settings') },
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex print:!hidden flex-col w-56 border-r bg-card p-4 gap-1">
        <HouseSwitcher />
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/app'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        <div className="mt-auto pt-4 border-t">
          <p className="text-xs font-medium px-3 truncate">
            {userProfile?.displayName}
          </p>
          <p className="text-xs text-muted-foreground px-3 truncate mb-2">
            {userProfile?.email}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t('common.signOut')}
          </Button>
          <Link
            to="/privacy"
            className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield className="h-3 w-3" />
            {t('common.privacyPolicy')}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-20 lg:pb-6 overflow-auto">
        <MobileHouseBar />
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden print:!hidden fixed bottom-0 inset-x-0 bg-card border-t flex py-2 z-40" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/app'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 flex-1 min-w-0 py-1 text-xs font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
