import { BrowserRouter, Routes, Route } from 'react-router'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { HouseholdProvider, useHousehold } from '@/context/HouseholdContext'
import { ExpenseProvider } from '@/context/ExpenseContext'
import { MortgageProvider } from '@/context/MortgageContext'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { InvitePage } from '@/pages/InvitePage'
import { InviteLandingPage } from '@/pages/InviteLandingPage'
import { SummaryPage } from '@/pages/SummaryPage'
import { MortgagePage } from '@/pages/MortgagePage'

function AppRoutes() {
  const { house, loading } = useHousehold()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // User has no house — show onboarding (unless on invite route)
  if (!house) {
    return (
      <Routes>
        <Route path="/invite/:inviteId" element={<InvitePage />} />
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    )
  }

  // User has a house — show the app
  return (
    <ExpenseProvider>
      <MortgageProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="mortgage" element={<MortgagePage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="summary" element={<SummaryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/invite/:inviteId" element={<InvitePage />} />
        </Routes>
      </MortgageProvider>
    </ExpenseProvider>
  )
}

function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/invite/:inviteId" element={<InviteLandingPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <HouseholdProvider>
      <AppRoutes />
    </HouseholdProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
