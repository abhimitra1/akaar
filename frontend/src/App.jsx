import { Route, Routes } from 'react-router-dom'
import ProfileGate from './components/ProfileGate.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import AccountPage from './pages/AccountPage.jsx'
import CompleteProfilePage from './pages/CompleteProfilePage.jsx'
import CraftPage from './pages/CraftPage.jsx'
import CreatePage from './pages/CreatePage.jsx'
import ExplorePage from './pages/ExplorePage.jsx'
import HomePage from './pages/HomePage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import MetadataPage from './pages/MetadataPage.jsx'
import ProcessingPage from './pages/ProcessingPage.jsx'
import SignInPage from './pages/SignInPage.jsx'
import SignUpPage from './pages/SignUpPage.jsx'
import WelcomePage from './pages/WelcomePage.jsx'

function App() {
  return (
    <AuthProvider>
      <ProfileGate>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/" element={<HomePage />} />
          <Route
            path="/complete-profile"
            element={
              <ProtectedRoute>
                <CompleteProfilePage />
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
          <Route
            path="/craft/:craftId"
            element={
              <ProtectedRoute>
                <CraftPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </ProfileGate>
    </AuthProvider>
  )
}

export default App
