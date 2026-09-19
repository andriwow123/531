import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import App from './App';
import { routes } from './router';
import { db } from '../data/db';

// NOTE: react-router's <RouterProvider> renders its own internal <Router>, which
// throws if nested inside another <Router> (e.g. <MemoryRouter>). App accepts an
// injectable `router` prop instead, so tests build a memory router with
// createMemoryRouter — the data-router equivalent of wrapping with <MemoryRouter>.

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('App', () => {
  it('mounts without throwing', () => {
    const memoryRouter = createMemoryRouter(routes, { initialEntries: ['/onboarding'] });
    expect(() => render(<App router={memoryRouter} />)).not.toThrow();
  });

  it('redirects to /onboarding when no profile is saved', async () => {
    const memoryRouter = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<App router={memoryRouter} />);
    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe('/onboarding'));
  });
});
