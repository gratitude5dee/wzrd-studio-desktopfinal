import { BrainCircuit } from 'lucide-react';

import AppShell from '@/components/layout/AppShell';

export default function CreativeIntelligence() {
  return (
    <AppShell activeView="creative-intelligence" contentClassName="flex min-h-screen items-center justify-center px-4">
      <section className="flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#f97316] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <BrainCircuit className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Creative Intelligence
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
          Coming soon
        </h1>
      </section>
    </AppShell>
  );
}
