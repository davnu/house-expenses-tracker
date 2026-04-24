import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { HouseholdProvider, useHousehold } from '@/context/HouseholdContext'
import { ExpenseProvider } from '@/context/ExpenseContext'
import { MortgageProvider } from '@/context/MortgageContext'
import { BudgetProvider } from '@/context/BudgetContext'
import { DocumentProvider } from '@/context/DocumentContext'
import { TodoProvider } from '@/context/TodoContext'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingScreen, PageSkeleton } from '@/components/ui/loading'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { LandingPage } from '@/pages/LandingPage'
// Blog pages are code-split. They only load once a visitor hits /blog or
// /{lang}/blog — the landing bundle stays small and fast for first paint.
const BlogListPage = lazy(() => import('@/pages/BlogListPage').then(m => ({ default: m.BlogListPage })))
const BlogArticlePage = lazy(() => import('@/pages/BlogArticlePage').then(m => ({ default: m.BlogArticlePage })))
import { OnboardingPage } from '@/pages/OnboardingPage'
import { InvitePage } from '@/pages/InvitePage'
import { InviteLandingPage } from '@/pages/InviteLandingPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { MortgagePage } from '@/pages/MortgagePage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'
import { ThanksPage } from '@/pages/ThanksPage'
import { PricingPage } from '@/pages/PricingPage'
import { UpgradeDialogProvider, useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { CreateHouseProvider } from '@/context/CreateHouseContext'
import { EntitlementProvider } from '@/context/EntitlementContext'
// Lazy-loaded auth pages — rarely visited, kept out of the critical bundle.
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const AuthActionPage = lazy(() => import('@/pages/AuthActionPage').then(m => ({ default: m.AuthActionPage })))
// Lazy-load UpgradeModal: only loaded the first time a user hits a paywall.
// Keeps ~15 KB off the critical bundle for the ~60% who never upgrade.
const UpgradeModal = lazy(() => import('@/components/billing/UpgradeModal').then(m => ({ default: m.UpgradeModal })))

/** Mounts UpgradeModal only once opened — avoids fetching its chunk on every app mount. */
function LazyUpgradeModalMount() {
  const { isOpen } = useUpgradeDialog()
  if (!isOpen) return null
  return (
    <Suspense fallback={null}>
      <UpgradeModal />
    </Suspense>
  )
}

/* ── App routes (inside /app/*, requires house) ── */

function AppRoutes() {
  const { house, houses, userProfile, loading } = useHousehold()

  // Shell-level providers (entitlement + upgrade-dialog) wrap EVERY render
  // branch below. Why: AppShell renders HouseSwitcher, which reads
  // `useUpgradeDialog()`. During the "profile loaded, house still fetching"
  // window we render the AppShell shell with a skeleton — that branch must
  // have the provider available or HouseSwitcher throws on mount.
  //
  // EntitlementProvider safely handles `house === null` (returns loading=false
  // with free limits), so hoisting it above the load check is free.
  return (
    <EntitlementProvider>
      <UpgradeDialogProvider>
        <CreateHouseProvider>
          <AppRoutesBody house={house} houses={houses} userProfile={userProfile} loading={loading} />
          <LazyUpgradeModalMount />
        </CreateHouseProvider>
      </UpgradeDialogProvider>
    </EntitlementProvider>
  )
}

interface AppRoutesBodyProps {
  house: ReturnType<typeof useHousehold>['house']
  houses: ReturnType<typeof useHousehold>['houses']
  userProfile: ReturnType<typeof useHousehold>['userProfile']
  loading: ReturnType<typeof useHousehold>['loading']
}

function AppRoutesBody({ house, houses, userProfile, loading }: AppRoutesBodyProps) {
  // User has no houses — show onboarding
  if (!loading && !house && !userProfile?.houseId && houses.length === 0) {
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    )
  }

  // Still loading or house doc not ready.
  // If we already know the user has a house (profile loaded with houseId), show the app
  // shell with skeleton content — navigation appears instantly, only content area pulses.
  // Otherwise (profile still loading, or user has no house yet), show the basic loader
  // to avoid flashing AppShell before OnboardingPage for new users.
  if (loading || !house) {
    if (userProfile?.houseId) {
      return (
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<PageSkeleton />} />
          </Route>
        </Routes>
      )
    }
    return <LoadingScreen />
  }

  return (
    <ExpenseProvider>
      <MortgageProvider>
        <BudgetProvider>
          <DocumentProvider>
            <TodoProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="mortgage" element={<MortgagePage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route path="documents" element={<DocumentsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Routes>
            </TodoProvider>
          </DocumentProvider>
        </BudgetProvider>
      </MortgageProvider>
    </ExpenseProvider>
  )
}

/* ── Auth guard for /app/* ── */

function ProtectedApp() {
  const { user, loading, emailVerified } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!emailVerified) return <VerifyEmailPage />

  return (
    <HouseholdProvider>
      <AppRoutes />
    </HouseholdProvider>
  )
}

/* ── Login route: redirect to /app if already logged in ── */

function LoginGate() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/app" replace />

  return <LoginPage />
}

/* ── Forgot-password route: redirect to /app if already logged in ── */

function ForgotPasswordGate() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/app" replace />

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ForgotPasswordPage />
    </Suspense>
  )
}

function AuthActionGate() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthActionPage />
    </Suspense>
  )
}

/* Legacy redirect: old /reset-password?oobCode=... links → /auth/action?mode=resetPassword&oobCode=... */
function ResetPasswordAlias() {
  const search = new URLSearchParams(window.location.search)
  if (!search.has('mode')) search.set('mode', 'resetPassword')
  return <Navigate to={`/auth/action?${search.toString()}`} replace />
}

/* ── Invite route: landing if not logged in, join flow if logged in ── */

function InviteGate() {
  const { user, loading, emailVerified } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <InviteLandingPage />
  if (!emailVerified) return <VerifyEmailPage />

  return (
    <HouseholdProvider>
      <InvitePage />
    </HouseholdProvider>
  )
}

/* ── SEO language landing: /es, /fr, /de, /nl, /pt serve pre-rendered HTML.
   React Router needs matching routes so the catch-all doesn't redirect to /. ── */

const SEO_LANGUAGES = ['es', 'fr', 'de', 'nl', 'pt'] as const

function LanguageLanding() {
  return <LandingPage />
}

/* ── Root ── */

/**
 * Resets scroll position on client-side route transitions.
 *
 * Without this, React Router preserves the previous page's scroll — so
 * jumping from the "Learn" section at the bottom of the landing page to
 * /blog lands the reader at the bottom of the blog index, which feels
 * broken. This hook runs once on every location change:
 *
 *   - PUSH / REPLACE  → scroll to top (new navigation)
 *   - POP (back/fwd)  → no-op, let the browser restore the stored position
 *   - #hash present   → scroll that element into view (landing-page anchors)
 *
 * Mounted once inside <BrowserRouter> but outside <Routes> so every route
 * benefits. In-page smooth-scroll buttons on the landing page (`scrollTo()`)
 * don't touch router state, so they're unaffected.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType === 'POP') return

    if (hash) {
      // Defer one frame so the target route's DOM has mounted before we seek.
      requestAnimationFrame(() => {
        const id = decodeURIComponent(hash.replace(/^#/, ''))
        const el = id ? document.getElementById(id) : null
        if (el) el.scrollIntoView({ block: 'start' })
        else window.scrollTo(0, 0)
      })
      return
    }

    window.scrollTo(0, 0)
  }, [pathname, hash, navigationType])

  return null
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* Public routes */}
          <Route index element={<LandingPage />} />
          <Route path="/login" element={<LoginGate />} />
          <Route path="/forgot-password" element={<ForgotPasswordGate />} />
          <Route path="/auth/action" element={<AuthActionGate />} />
          {/* Legacy alias — old /reset-password links get upgraded to /auth/action. */}
          <Route path="/reset-password" element={<ResetPasswordAlias />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/thanks" element={<ThanksPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/invite/:inviteId" element={<InviteGate />} />

          {/* Protected app */}
          <Route path="/app/*" element={<ProtectedApp />} />

          {/* SEO language landing pages (/es, /fr, /de, /nl, /pt) */}
          {SEO_LANGUAGES.map(lang => (
            <Route key={lang} path={`/${lang}`} element={<LanguageLanding />} />
          ))}

          {/* Blog — lazy-loaded. Suspense fallback is PageSkeleton so the
              header bar appears instantly even before the blog chunk lands. */}
          <Route
            path="/blog"
            element={<Suspense fallback={<PageSkeleton />}><BlogListPage lang="en" /></Suspense>}
          />
          <Route
            path="/blog/:slug"
            element={<Suspense fallback={<PageSkeleton />}><BlogArticlePage lang="en" /></Suspense>}
          />
          {SEO_LANGUAGES.map(lang => (
            <Route
              key={`${lang}-blog`}
              path={`/${lang}/blog`}
              element={<Suspense fallback={<PageSkeleton />}><BlogListPage lang={lang} /></Suspense>}
            />
          ))}
          {SEO_LANGUAGES.map(lang => (
            <Route
              key={`${lang}-blog-article`}
              path={`/${lang}/blog/:slug`}
              element={<Suspense fallback={<PageSkeleton />}><BlogArticlePage lang={lang} /></Suspense>}
            />
          ))}

          {/* Legacy redirects (old bookmarks) */}
          <Route path="/mortgage" element={<Navigate to="/app/mortgage" replace />} />
          <Route path="/expenses" element={<Navigate to="/app/expenses" replace />} />
          <Route path="/documents" element={<Navigate to="/app/documents" replace />} />
          <Route path="/settings" element={<Navigate to="/app/settings" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
