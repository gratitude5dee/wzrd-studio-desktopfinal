import { Suspense, lazy } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { appRoutes } from '@/lib/routes';

const Landing = lazy(() => import('./pages/Landing'));
const LoginRoute = lazy(() => import('./app/LoginRoute'));
const AuthenticatedRoutes = lazy(() => import('./app/AuthenticatedRoutes'));
const ImageEditorPage = lazy(() => import('./mini/image/ImageEditorPage'));
const ArtifactPage = lazy(() => import('./mini/artifact/ArtifactPage'));


const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <TooltipProvider>
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
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
