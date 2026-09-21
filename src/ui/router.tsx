import { createBrowserRouter, redirect } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { profileRepo } from '../data/repositories';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import CycleEnd from './screens/CycleEnd';
import History from './screens/History';
import Settings from './screens/Settings';

/** Loader guard: routes that require a completed profile redirect to onboarding when none is saved. */
async function requireProfile() {
  const profile = await profileRepo.get();
  if (!profile) {
    return redirect('/onboarding');
  }
  return null;
}

export const routes: RouteObject[] = [
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/', element: <Home />, loader: requireProfile },
  { path: '/cycle-end', element: <CycleEnd />, loader: requireProfile },
  { path: '/history', element: <History />, loader: requireProfile },
  { path: '/settings', element: <Settings />, loader: requireProfile },
];

// Under GitHub Pages the app is served from a sub-path (e.g. /531/); the router
// must know that prefix so links/loaders resolve correctly. Vite injects it as
// import.meta.env.BASE_URL ('/531/' in the deployed build, '/' in dev/tests).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter(routes, { basename });

export type AppRouter = ReturnType<typeof createBrowserRouter>;
