import { Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute.jsx'
import ManagerRoute from './components/ManagerRoute.jsx'
import ProfileGate from './components/ProfileGate.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { supabaseConfigured } from './supabaseClient.js'
import AboutPage from './pages/AboutPage.jsx'
import AcceptTermsPage from './pages/AcceptTermsPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import BrandingPage from './pages/BrandingPage.jsx'
import CommissionDetailPage from './pages/CommissionDetailPage.jsx'
import CraftPage from './pages/CraftPage.jsx'
import CreatePage from './pages/CreatePage.jsx'
import ExplorePage from './pages/ExplorePage.jsx'
import HomePage from './pages/HomePage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import ManagerPage from './pages/ManagerPage.jsx'
import ManagerReviewPage from './pages/ManagerReviewPage.jsx'
import MetadataPage from './pages/MetadataPage.jsx'
import MyCommissionsPage from './pages/MyCommissionsPage.jsx'
import PolicyPage from './pages/PolicyPage.jsx'
import ProcessingPage from './pages/ProcessingPage.jsx'
import SignInPage from './pages/SignInPage.jsx'
import SignUpPage from './pages/SignUpPage.jsx'
import TermsPage from './pages/TermsPage.jsx'
import WelcomePage from './pages/WelcomePage.jsx'

function App() {
  // Catches the exact failure shape from commit 08d7121 (VITE_GPU_PROXY_URL then, Supabase
  // vars now): env vars set in the local .env but never synced to Vercel's own project
  // settings. Without this check the app would otherwise crash blank at import time — see
  // supabaseClient.js.
  if (!supabaseConfigured) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1>Configuration error</h1>
        <p>
          This deployment is missing required Supabase environment variables
          (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Set them in the hosting
          provider&rsquo;s project settings and redeploy.
        </p>
      </div>
    )
  }

  return (
    <AuthProvider>
      <ProfileGate>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/" element={<HomePage />} />
          {/* Public — readable before signing up (linked from SignUpPage/AcceptTermsPage). */}
          <Route path="/policy" element={<PolicyPage />} />
          {/* Public — About/Branding/Terms, linked from AppNav's desktop sidebar + AccountPage's footer. */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/branding" element={<BrandingPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="/accept-terms"
            element={
              <ProtectedRoute>
                <AcceptTermsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <LibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <AccountPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="/manager"
            element={
              <ManagerRoute>
                <ManagerPage />
              </ManagerRoute>
            }
          />
          <Route
            path="/manager/:commissionId"
            element={
              <ManagerRoute>
                <ManagerReviewPage />
              </ManagerRoute>
            }
          />
          <Route
            path="/commissions"
            element={
              <ProtectedRoute>
                <MyCommissionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commissions/:commissionId"
            element={
              <ProtectedRoute>
                <CommissionDetailPage />
              </ProtectedRoute>
            }
          />
          {/* Guest-accessible per AGENTS.md §3 Phase 1 (browse/search doesn't require sign-in). */}
          <Route path="/explore" element={<ExplorePage />} />
          <Route
            path="/create"
            element={
              <ProtectedRoute>
                <CreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/processing/:jobId"
            element={
              <ProtectedRoute>
                <ProcessingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/craft/:craftId/metadata"
            element={
              <ProtectedRoute>
                <MetadataPage />
              </ProtectedRoute>
            }
          />
          {/* Guest-accessible per AGENTS.md §3 Phase 1 (view/3D/AR doesn't require sign-in) —
              CraftPage itself already treats `user` as optional (isOwner gates Edit/Publish;
              RLS already hides anything a guest shouldn't see). Was incorrectly wrapped in
              ProtectedRoute, which bounced guests to /welcome before they could view anything. */}
          <Route path="/craft/:craftId" element={<CraftPage />} />
        </Routes>
      </ProfileGate>
    </AuthProvider>
  )
}

export default App
