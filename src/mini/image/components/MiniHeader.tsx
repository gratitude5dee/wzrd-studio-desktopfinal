import { cn } from '@/lib/utils';

interface MiniHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

/** 44pt header (§3.1): wordmark left, at most one action right. */
export function MiniHeader({ title, action, className }: MiniHeaderProps) {
  return (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center justify-between border-b border-wzrd-hairline px-4',
        className
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-semibold tracking-[0.18em] text-wzrd-mist">
          WZRD
        </span>
        <span className="text-[13px] text-wzrd-chrome">{title}</span>
      </div>
      {action}
    </header>
  );
}
