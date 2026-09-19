import { createBrowserRouter, redirect } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { profileRepo } from '../data/repositories';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';

/** Loader guard: routes that require a completed profile redirect to onboarding when none is saved. */
async function requireProfile() {
  const profile = await profileRepo.get();
  if (!profile) {
    return redirect('/onboarding');
  }
  return null;
}

// Screens land in later tasks — minimal stubs for now.
function CycleEndScreen() {
  return <h1>Cycle complete</h1>;
}

function HistoryScreen() {
  return <h1>History</h1>;
}

function SettingsScreen() {
  return <h1>Settings</h1>;
}

export const routes: RouteObject[] = [
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/', element: <Home />, loader: requireProfile },
  { path: '/cycle-end', element: <CycleEndScreen />, loader: requireProfile },
  { path: '/history', element: <HistoryScreen />, loader: requireProfile },
  { path: '/settings', element: <SettingsScreen />, loader: requireProfile },
];

export const router = createBrowserRouter(routes);

export type AppRouter = ReturnType<typeof createBrowserRouter>;
