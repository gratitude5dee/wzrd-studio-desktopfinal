import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThirdwebProvider } from 'thirdweb/react';
import { AuthProvider } from '@/providers/AuthProvider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';

const Login = lazy(() => import('@/legacy-pages/Login'));

const LoginRoute = () => {
  return (
    <ThirdwebProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="*" element={<Login />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ThirdwebProvider>
  );
};

export default LoginRoute;
