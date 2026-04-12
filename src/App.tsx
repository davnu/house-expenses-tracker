import { useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { HouseholdProvider, useHousehold } from '@/context/HouseholdContext'
import { ExpenseProvider } from '@/context/ExpenseContext'
import { MortgageProvider } from '@/context/MortgageContext'
import { DocumentProvider } from '@/context/DocumentContext'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingScreen, LoadingInline } from '@/components/ui/loading'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { InvitePage } from '@/pages/InvitePage'
import { InviteLandingPage } from '@/pages/InviteLandingPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { MortgagePage } from '@/pages/MortgagePage'
import { PrivacyPage } from '@/pages/PrivacyPage'

function AppRoutes() {
  const { house, houses, userProfile, loading } = useHousehold()

  if (loading) return <LoadingScreen />

  // User has no houses at all — show onboarding (unless on invite or privacy route)
  if (!house && !userProfile?.houseId && houses.length === 0) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/invite/:inviteId" element={<InvitePage />} />
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    )
  }

  // houseId is set or houses exist but house doc hasn't loaded yet — show loading
  if (!house) {
    return (
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<LoadingInline />} />
        </Route>
      </Routes>
    )
  }

  // User has a house — show the app
  return (
    <ExpenseProvider>
      <MortgageProvider>
        <DocumentProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="mortgage" element={<MortgagePage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="/invite/:inviteId" element={<InvitePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </DocumentProvider>
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
