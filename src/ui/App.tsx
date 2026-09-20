import { RouterProvider } from 'react-router-dom';
import { router, type AppRouter } from './router';
import { SettingsProvider } from './settings/SettingsContext';

interface AppProps {
  /** Overridable for tests (e.g. a createMemoryRouter instance). Defaults to the real browser router. */
  router?: AppRouter;
}

function App({ router: routerProp }: AppProps = {}) {
  return (
    <SettingsProvider>
      <RouterProvider router={routerProp ?? router} />
    </SettingsProvider>
  );
}

export default App;
