import { useEffect, type ReactNode } from 'react';

/**
 * Minimal root for the mini-apps.
 *
 * Deliberately provider-free: the desktop app's provider stack (voice agent,
 * sidebar, auth gates, query client) is not mounted here so the route bundle
 * stays inside the §8 budget and the surface works with zero sign-in.
 */
export function MiniShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) root.classList.remove('dark');
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-wzrd-abyss text-wzrd-mist antialiased">
      {children}
    </div>
  );
}

export default MiniShell;
