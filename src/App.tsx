import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { appRoutes } from '@/lib/routes';
import { AppProviders } from './app/providers';

const Landing = lazy(() => import('./legacy-pages/Landing'));
const LoginRoute = lazy(() => import('./app/LoginRoute'));
const AuthenticatedRoutes = lazy(() => import('./app/AuthenticatedRoutes'));
const ImageEditorPage = lazy(() => import('./mini/image/ImageEditorPage'));
const ArtifactPage = lazy(() => import('./mini/artifact/ArtifactPage'));

const App = () => {
  return (
    <AppProviders>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            {/* Public — no auth, no wallet, no studio providers */}
            <Route path={appRoutes.landing} element={<Landing />} />

            {/* Mini-apps — public, zero-auth, provider-free route tree */}
            <Route path={appRoutes.mini.image} element={<ImageEditorPage />} />
            <Route path="/a/:artifactId" element={<ArtifactPage />} />

            {/* Login — auth + wallet only */}
            <Route path={appRoutes.login} element={<LoginRoute />} />

            {/* Authenticated — full provider stack */}
            <Route path="*" element={<AuthenticatedRoutes />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
};

export default App;
