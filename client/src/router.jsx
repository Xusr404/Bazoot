import { Suspense, lazy } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { Loader } from './components/ui/Loader.jsx'
import { GameProvider } from './context/GameContext.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { PlayerGamePage } from './pages/PlayerGamePage.jsx'
import { RouteErrorPage } from './pages/RouteErrorPage.jsx'
import { RouteNotFoundPage } from './pages/RouteNotFoundPage.jsx'
import { RootLayout } from './pages/RootLayout.jsx'

// Manager/editor pages are code-split out of the player bundle: a player who
// only joins a game never downloads the manager dashboard or the quiz editor.
// (React.lazy wants a default export; these modules use named exports.)
const ManagerPage = lazy(() =>
  import('./pages/ManagerPage.jsx').then((m) => ({ default: m.ManagerPage })),
)
const ManagerGamePage = lazy(() =>
  import('./pages/ManagerGamePage.jsx').then((m) => ({ default: m.ManagerGamePage })),
)
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage.jsx').then((m) => ({ default: m.VerifyEmailPage })),
)
const AcceptInvitationPage = lazy(() =>
  import('./pages/AcceptInvitationPage.jsx').then((m) => ({ default: m.AcceptInvitationPage })),
)
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage.jsx').then((m) => ({ default: m.ResetPasswordPage })),
)

// Full-screen fallback while a lazy chunk loads (app background already on body).
const RouteFallback = () => (
  <div className="flex min-h-dvh items-center justify-center">
    <Loader className="h-30" />
  </div>
)

// Role-scoped providers live on pathless layout routes so game state survives
// navigation between the auth page and the party page (same URLs as source).
const PlayerSection = () => (
  <GameProvider role="player">
    <Outlet />
  </GameProvider>
)

const ManagerSection = () => (
  <GameProvider role="manager">
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  </GameProvider>
)

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PlayerSection />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: 'party/:gameId',
            element: <PlayerGamePage />,
          },
        ],
      },
      {
        element: <ManagerSection />,
        children: [
          {
            // Manager subpages share one route so auth/socket/editor state survives
            // browser navigation while ManagerPage maps the suffix to a stable view.
            path: 'manager/*',
            element: <ManagerPage />,
          },
          {
            path: 'manager/verify',
            element: <VerifyEmailPage />,
          },
          {
            path: 'manager/invite',
            element: <AcceptInvitationPage />,
          },
          {
            path: 'manager/reset-password',
            element: <ResetPasswordPage />,
          },
          {
            path: 'party/manager/:gameId',
            element: <ManagerGamePage />,
          },
        ],
      },
      {
        path: '*',
        element: <RouteNotFoundPage />,
      },
    ],
  },
])

export const Router = () => <RouterProvider router={router} />
