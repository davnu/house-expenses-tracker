import { NavLink, Link, Outlet } from 'react-router'
import { LayoutDashboard, Landmark, Receipt, Settings, LogOut, FileText, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import { Button } from '@/components/ui/button'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/mortgage', icon: Landmark, label: 'Mortgage' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/summary', icon: FileText, label: 'Summary' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function AppShell() {
  const { logout } = useAuth()
  const { userProfile, house } = useHousehold()

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 border-r bg-card p-4 gap-1">
        <div className="px-3 py-4">
          <h1 className="text-lg font-bold">{house?.name ?? 'House Expenses'}</h1>
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
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
            Sign out
          </Button>
          <Link
            to="/privacy"
            className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield className="h-3 w-3" />
            Privacy Policy
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-20 lg:pb-6 p-4 lg:p-6 overflow-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card border-t flex justify-around py-2 z-40">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
