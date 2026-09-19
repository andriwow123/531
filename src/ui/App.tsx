import { RouterProvider } from 'react-router-dom';
import { router, type AppRouter } from './router';

interface AppProps {
  /** Overridable for tests (e.g. a createMemoryRouter instance). Defaults to the real browser router. */
  router?: AppRouter;
}

function App({ router: routerProp }: AppProps = {}) {
  return <RouterProvider router={routerProp ?? router} />;
}

export default App;
