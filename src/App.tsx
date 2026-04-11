import { useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { HouseholdProvider, useHousehold } from '@/context/HouseholdContext'
import { ExpenseProvider } from '@/context/ExpenseContext'
import { MortgageProvider } from '@/context/MortgageContext'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingScreen } from '@/components/ui/loading'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { InvitePage } from '@/pages/InvitePage'
import { InviteLandingPage } from '@/pages/InviteLandingPage'
import { SummaryPage } from '@/pages/SummaryPage'
import { MortgagePage } from '@/pages/MortgagePage'
import { PrivacyPage } from '@/pages/PrivacyPage'

function AppRoutes() {
  const { house, userProfile, loading } = useHousehold()

  if (loading) return <LoadingScreen />

  // houseId is set but house doc hasn't loaded yet — wait for snapshot
  if (!house && userProfile?.houseId) return <LoadingScreen />

  // User has no house — show onboarding (unless on invite or privacy route)
  if (!house) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
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
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </MortgageProvider>
    </ExpenseProvider>
  )
}

function AuthGate() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const wasLoggedOut = useRef(true)

  if (loading) return <LoadingScreen />

  if (!user) {
    wasLoggedOut.current = true
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/invite/:inviteId" element={<InviteLandingPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  // Just logged in — redirect to dashboard if on a stale route
  if (wasLoggedOut.current && location.pathname !== '/' && !location.pathname.startsWith('/invite') && location.pathname !== '/privacy') {
    wasLoggedOut.current = false
    return <Navigate to="/" replace />
  }
  wasLoggedOut.current = false

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
