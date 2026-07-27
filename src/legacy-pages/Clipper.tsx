import AppShell from '@/components/layout/AppShell';
import ClipStudio from './ClipStudio';

export default function Clipper() {
  return (
    <AppShell activeView="clipper" contentAs="div" contentClassName="pb-20 md:pb-0">
      <ClipStudio showAppHeader={false} />
    </AppShell>
  );
}
