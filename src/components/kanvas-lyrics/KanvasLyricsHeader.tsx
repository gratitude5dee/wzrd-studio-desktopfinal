import { useNavigate } from 'react-router-dom';
import {
  Clapperboard,
  Globe2,
  Home,
  Image as ImageIcon,
  Mic2,
  Music2,
  Pencil,
  Settings,
  Sparkles,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { KANVAS_STUDIO_ORDER, KANVAS_STUDIO_META } from '@/features/kanvas/helpers';
import CreditsDisplay from '@/components/CreditsDisplay';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STUDIO_ICONS = {
  image: ImageIcon,
  video: Video,
  edit: Pencil,
  cinema: Clapperboard,
  lipsync: Mic2,
  worldview: Globe2,
  'character-creation': Sparkles,
} as const;

export function KanvasLyricsHeader() {
  const navigate = useNavigate();

  return (
    <header
      className="sticky top-0 z-40 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-transparent"
      style={{ borderImage: 'linear-gradient(to right, rgba(249,115,22,0.15), transparent 60%) 1' }}
    >
      <div className="flex items-center justify-between px-5 py-1.5">
        {/* Left: WZRD logo + ALPHA chip */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0 md:min-w-[140px]">
          <img
            src="/lovable-uploads/wzrdtechlogo.png"
            alt="WZRD STUDIO Logo"
            className="h-10 md:h-14 object-contain cursor-pointer"
            onClick={() => navigate(appRoutes.home)}
          />
          <span className="hidden sm:inline text-[10px] text-[#f97316] bg-[#f97316]/10 px-2 py-0.5 rounded-full border border-[#f97316]/20 font-medium">
            ALPHA
          </span>
        </div>

        {/* Center: pill-slider studio nav */}
        <div className="hidden md:inline-flex items-center bg-[#111] rounded-full p-1 border border-white/[0.06] gap-0.5">
          {KANVAS_STUDIO_ORDER.map((s) => {
            const Icon = STUDIO_ICONS[s as keyof typeof STUDIO_ICONS];
            return (
              <button
                key={s}
                type="button"
                onClick={() => navigate(`${appRoutes.kanvas}?studio=${s}`)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                  'text-zinc-500 hover:text-zinc-300'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{KANVAS_STUDIO_META[s].label}</span>
              </button>
            );
          })}
          {/* Lyrics — active here */}
          <button
            type="button"
            onClick={() => navigate(appRoutes.kanvasLyrics)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
              'bg-white/10 text-[#f97316] shadow-[inset_0_0_12px_rgba(249,115,22,0.06)]'
            )}
            aria-current="page"
          >
            <Music2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Lyrics</span>
          </button>
        </div>

        {/* Right cluster */}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-2 min-w-0 md:min-w-[140px] justify-end">
            <CreditsDisplay />
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate(appRoutes.home)}
                  className="hidden md:flex h-9 w-9 rounded-full bg-white/[0.04] border border-white/[0.06] items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all duration-200"
                  aria-label="Home"
                >
                  <Home className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                Home
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate(appRoutes.systemBilling)}
                  className="hidden md:flex h-9 w-9 rounded-full bg-white/[0.04] border border-white/[0.06] items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all duration-200"
                  aria-label="System"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                System & Billing
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </header>
  );
}
