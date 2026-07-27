import {
  Clapperboard,
  Globe2,
  Image as ImageIcon,
  Mic2,
  Music2,
  Pencil,
  Sparkles,
  Video,
  type LucideIcon,
} from 'lucide-react';

import { KANVAS_STUDIO_META, KANVAS_STUDIO_ORDER } from '@/features/kanvas/helpers';
import type { KanvasStudio } from '@/features/kanvas/types';
import { appRoutes } from '@/lib/routes';

const STUDIO_ICON_MAP: Record<KanvasStudio, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  edit: Pencil,
  cinema: Clapperboard,
  lipsync: Mic2,
  worldview: Globe2,
  'character-creation': Sparkles,
};

export interface KanvasStudioNavItem {
  key: KanvasStudio;
  label: string;
  headline: string;
  description: string;
  queryValue: string;
  Icon: LucideIcon;
}

export interface KanvasRouteNavItem {
  key: 'lyrics';
  label: string;
  routeOverride: string;
  Icon: LucideIcon;
}

export const KANVAS_STUDIO_NAV: KanvasStudioNavItem[] = KANVAS_STUDIO_ORDER.map((key) => ({
  ...KANVAS_STUDIO_META[key],
  key,
  queryValue: key,
  Icon: STUDIO_ICON_MAP[key] ?? Sparkles,
}));

export const KANVAS_LYRICS_NAV_ITEM: KanvasRouteNavItem = {
  key: 'lyrics',
  label: 'Lyrics',
  routeOverride: appRoutes.kanvasLyrics,
  Icon: Music2,
};

export const KANVAS_STUDIO_ICON_BY_KEY: Record<KanvasStudio, LucideIcon> = KANVAS_STUDIO_NAV.reduce(
  (acc, item) => {
    acc[item.key] = item.Icon;
    return acc;
  },
  {} as Record<KanvasStudio, LucideIcon>,
);
