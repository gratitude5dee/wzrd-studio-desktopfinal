// ---------------------------------------------------------------------------
// Character preset starters — curated starter images that seed a new
// character draft with an image plus trait/style defaults.
// ---------------------------------------------------------------------------

import { musicPolishAssets } from '@/lib/musicPolishAssets';
import type { CharacterStyleDetails, CharacterTraits } from '@/types/character-creation';

export interface CharacterPreset {
  id: string;
  name: string;
  imageUrl: string;
  alt: string;
  traits: Partial<CharacterTraits>;
  styleDetails: Partial<CharacterStyleDetails>;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'lead-vocalist',
    name: 'Lead Vocalist',
    imageUrl: musicPolishAssets.talent.leadVocalist.src,
    alt: musicPolishAssets.talent.leadVocalist.alt,
    traits: { characterType: 'Human', gender: 'Female', age: 'Adult' },
    styleDetails: { artStyle: 'Photorealistic', customPrompt: 'premium music video styling bay, controlled key light' },
  },
  {
    id: 'voice-artist',
    name: 'Voice Artist',
    imageUrl: musicPolishAssets.talent.voiceBooth.src,
    alt: musicPolishAssets.talent.voiceBooth.alt,
    traits: { characterType: 'Human', age: 'Adult' },
    styleDetails: { artStyle: 'Photorealistic', customPrompt: 'dark recording booth, microphone foreground' },
  },
  {
    id: 'motion-performer',
    name: 'Motion Performer',
    imageUrl: musicPolishAssets.talent.motionStage.src,
    alt: musicPolishAssets.talent.motionStage.alt,
    traits: { characterType: 'Human', age: 'Adult' },
    styleDetails: { artStyle: '3D Render', customPrompt: 'rehearsal capture stage, coral and cyan light' },
  },
  {
    id: 'face-model',
    name: 'Face Model',
    imageUrl: musicPolishAssets.talent.faceWardrobe.src,
    alt: musicPolishAssets.talent.faceWardrobe.alt,
    traits: { characterType: 'Human' },
    styleDetails: { artStyle: 'Photorealistic', customPrompt: 'wardrobe bay portrait, practical mirror light' },
  },
];

// ---------------------------------------------------------------------------
// Pending starter hand-off — lets the gallery stash a preset that the
// builder consumes when it mounts.
// ---------------------------------------------------------------------------

let pendingPreset: CharacterPreset | null = null;

export function stashPresetStarter(preset: CharacterPreset): void {
  pendingPreset = preset;
}

export function takePresetStarter(): CharacterPreset | null {
  const preset = pendingPreset;
  pendingPreset = null;
  return preset;
}
