import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLockGate from './components/AppLockGate'
import AutoLogout from './components/AutoLogout'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'

// Code-split per route: nobody navigating straight to /watch needs the movies/series/profiles
// bundles, and vice versa. LoginPage stays eager (it's what everyone hits first, unauthenticated;
// lazy-loading it would just add a network round trip before the very first screen can paint).
import LoginPage from './pages/LoginPage'
const DiagnosticPage = lazy(() => import('./pages/DiagnosticPage'))
const DownloadsPage = lazy(() => import('./pages/DownloadsPage'))
const EpgGuidePage = lazy(() => import('./pages/EpgGuidePage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const LivePage = lazy(() => import('./pages/LivePage'))
const MovieDetailPage = lazy(() => import('./pages/MovieDetailPage'))
const MoviesPage = lazy(() => import('./pages/MoviesPage'))
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SeriesDetailPage = lazy(() => import('./pages/SeriesDetailPage'))
const SeriesPage = lazy(() => import('./pages/SeriesPage'))
const SupportPage = lazy(() => import('./pages/SupportPage'))
const TeamsPage = lazy(() => import('./pages/TeamsPage'))
const WatchPage = lazy(() => import('./pages/WatchPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-outline-strong border-t-brand-400" />
    </div>
  )
}

export default function App() {


  return (
    <BrowserRouter>
      <AppLockGate />
      <AutoLogout />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/watch/:kind/:id"
            element={
              <RequireAuth>
                <WatchPage />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/guide" element={<EpgGuidePage />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/movies/:id" element={<MovieDetailPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/series/:id" element={<SeriesDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/times" element={<TeamsPage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/diagnostico" element={<DiagnosticPage />} />
            <Route path="/suporte" element={<SupportPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
