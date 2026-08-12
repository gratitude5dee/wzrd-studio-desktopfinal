import aiVisualWall from '@/assets/generated/music-polish/ai-visual-wall.png';
import animatedRainStreet from '@/assets/generated/music-polish/animated-rain-street.png';
import backgroundReframe from '@/assets/generated/music-polish/background-reframe.png';
import blueprintMicrophone from '@/assets/generated/music-polish/blueprint-microphone.png';
import blueprintSoundstage from '@/assets/generated/music-polish/blueprint-soundstage.png';
import blueprintVocalist from '@/assets/generated/music-polish/blueprint-vocalist.png';
import cinemaCastBoard from '@/assets/generated/music-polish/cinema-cast-board.png';
import cinemaNeonStreet from '@/assets/generated/music-polish/cinema-neon-street.png';
import cinemaPerformanceCloseup from '@/assets/generated/music-polish/cinema-performance-closeup.png';
import cinemaSoundstage from '@/assets/generated/music-polish/cinema-soundstage.png';
import heroGothicStorm from '@/assets/generated/music-polish/hero-gothic-storm.png';
import lyricsAnimatedRain from '@/assets/generated/music-polish/lyrics-animated-rain.png';
import starterGothicStorm from '@/assets/generated/kanvas/starter/lyrics/gothic-storm-v01.webp';
import lyricsRnbGlass from '@/assets/generated/music-polish/lyrics-rnb-glass.png';
import lyricsRooftopMotion from '@/assets/generated/music-polish/lyrics-rooftop-motion.png';
import editWorkbench from '@/assets/generated/music-polish/edit-workbench.png';
import lipsyncProductRead from '@/assets/generated/music-polish/lipsync-product-read.png';
import mobileEditorPortrait from '@/assets/generated/music-polish/mobile-editor-portrait.png';
import platformDeliveryWall from '@/assets/generated/music-polish/platform-delivery-wall.png';
import securityControlRoom from '@/assets/generated/music-polish/security-control-room.png';
import rooftopChoreography from '@/assets/generated/music-polish/rooftop-choreography.png';
import stageProductVisual from '@/assets/generated/music-polish/stage-product-visual.png';
import talentFaceWardrobe from '@/assets/generated/music-polish/talent-face-wardrobe.png';
import talentLeadVocalist from '@/assets/generated/music-polish/talent-lead-vocalist.png';
import talentMotionStage from '@/assets/generated/music-polish/talent-motion-stage.png';
import talentVoiceBooth from '@/assets/generated/music-polish/talent-voice-booth.png';
import { staticAssetUrl } from '@/lib/staticAsset';

export type MusicPolishAsset = {
  src: string;
  alt: string;
  title: string;
  style: string;
};

export const musicPolishAssets = {
  landing: {
    heroGothicStorm: {
      src: staticAssetUrl(heroGothicStorm),
      alt: 'Hyperreal gothic storm music video still with a silhouetted artist at an iron gate',
      title: 'Gothic Storm Key Art',
      style: 'Monochrome album-film still',
    },
    rooftopChoreography: {
      src: staticAssetUrl(rooftopChoreography),
      alt: 'Hyperreal rooftop view of a choreographed movement sequence in a rain-lit city plaza',
      title: 'Rooftop Choreography',
      style: 'Aerial movement plate',
    },
    animatedRainStreet: {
      src: staticAssetUrl(animatedRainStreet),
      alt: 'Stylized rain street music video frame with a young fictional performer under warm storefront light',
      title: 'Animated Rain Street',
      style: 'Illustrated narrative frame',
    },
    platformDeliveryWall: {
      src: staticAssetUrl(platformDeliveryWall),
      alt: 'Premium music video delivery wall with export crops, timeline plates, and waveform monitors',
      title: 'Platform Delivery Wall',
      style: 'Distribution control room',
    },
    securityControlRoom: {
      src: staticAssetUrl(securityControlRoom),
      alt: 'Secure media operations control room for protected music video assets and audit workflows',
      title: 'Secure Media Ops',
      style: 'Governance room',
    },
    mobileEditorPortrait: {
      src: staticAssetUrl(mobileEditorPortrait),
      alt: 'Portrait mobile music video editor interface with lyric plate, waveform, and scene thumbnails',
      title: 'Mobile Editor',
      style: 'Vertical editor plate',
    },
  },
  kanvas: {
    stageProductVisual: {
      src: staticAssetUrl(stageProductVisual),
      alt: 'Hyperreal product-style music video prop on a black glass stage with coral and cyan lighting',
      title: 'Stage Your Product',
      style: 'Hero prop still',
    },
    aiVisualWall: {
      src: staticAssetUrl(aiVisualWall),
      alt: 'Premium visual wall for a music video treatment with generated scene thumbnails and monitor glow',
      title: 'Generate Visuals',
      style: 'Creative wall',
    },
    backgroundReframe: {
      src: staticAssetUrl(backgroundReframe),
      alt: 'Music video subject reframed through different controlled stage backgrounds',
      title: 'Change Background',
      style: 'Background reframe',
    },
  },
  cinema: {
    castBoard: {
      src: staticAssetUrl(cinemaCastBoard),
      alt: 'Music video cast and treatment board with fictional performers and visual references',
      title: 'Cast Board',
      style: 'Treatment room',
    },
    soundstage: {
      src: staticAssetUrl(cinemaSoundstage),
      alt: 'Hyperreal music video soundstage with practical lighting and camera rig',
      title: 'Soundstage',
      style: 'Production suite',
    },
    neonStreet: {
      src: staticAssetUrl(cinemaNeonStreet),
      alt: 'Hyperreal neon street performance music video still with controlled cyan rain light',
      title: 'Neon Street',
      style: 'Night performance',
    },
    performanceCloseup: {
      src: staticAssetUrl(cinemaPerformanceCloseup),
      alt: 'Hyperreal close-up performance frame with microphone, haze, and coral key light',
      title: 'Performance Close-up',
      style: 'Artist close-up',
    },
  },
  lyrics: {
    gothicStorm: {
      src: staticAssetUrl(starterGothicStorm),
      alt: 'Rainy dark stone arcade with a quiet central area for animated lyric copy',
      title: 'Gothic Storm',
      style: 'Dark title plate',
    },
    rnbGlass: {
      src: staticAssetUrl(lyricsRnbGlass),
      alt: 'Minimal R&B lyric visual plate with black glass, warm coral light, and soft cyan fill',
      title: 'R&B Glass',
      style: 'Minimal glass plate',
    },
    rooftopMotion: {
      src: staticAssetUrl(lyricsRooftopMotion),
      alt: 'Rooftop choreography lyric visual plate with aerial motion paths and city rain',
      title: 'Rooftop Motion',
      style: 'Kinetic lyric plate',
    },
    animatedRain: {
      src: staticAssetUrl(lyricsAnimatedRain),
      alt: 'Animated rain street lyric visual plate with hand-painted atmosphere',
      title: 'Animated Rain',
      style: 'Illustrated lyric plate',
    },
  },
  blueprints: {
    vocalist: {
      src: staticAssetUrl(blueprintVocalist),
      alt: 'Fictional vocalist blueprint reference with turntable styling and controlled lighting',
      title: 'Vocalist Anchor',
      style: 'Character reference',
    },
    soundstage: {
      src: staticAssetUrl(blueprintSoundstage),
      alt: 'Soundstage blueprint reference with lighting positions and premium production detail',
      title: 'Soundstage Anchor',
      style: 'Location reference',
    },
    microphone: {
      src: staticAssetUrl(blueprintMicrophone),
      alt: 'Chrome microphone prop blueprint reference on black glass with measurement notes',
      title: 'Microphone Anchor',
      style: 'Object reference',
    },
  },
  talent: {
    leadVocalist: {
      src: staticAssetUrl(talentLeadVocalist),
      alt: 'Fictional lead vocalist portrait in a premium music video styling bay',
      title: 'Lead Vocalist',
      style: 'Consent-ready portrait',
    },
    voiceBooth: {
      src: staticAssetUrl(talentVoiceBooth),
      alt: 'Fictional voice artist recording in a dark premium booth with microphone foreground',
      title: 'Voice Artist',
      style: 'Recording booth',
    },
    motionStage: {
      src: staticAssetUrl(talentMotionStage),
      alt: 'Fictional movement performer on a rehearsal capture stage with controlled coral and cyan light',
      title: 'Motion Reference',
      style: 'Capture stage',
    },
    faceWardrobe: {
      src: staticAssetUrl(talentFaceWardrobe),
      alt: 'Fictional face model portrait in a dark wardrobe bay with practical mirror light',
      title: 'Face Model',
      style: 'Wardrobe reference',
    },
  },
  toolSurfaces: {
    lipsyncProductRead: {
      src: staticAssetUrl(lipsyncProductRead),
      alt: 'Fictional performer recording a product-read performance setup on a dark music video stage',
      title: 'Performance Product Read',
      style: 'Creator production setup',
    },
    editWorkbench: {
      src: staticAssetUrl(editWorkbench),
      alt: 'Professional image edit workbench showing a music video frame inpainted on a dark post-production monitor',
      title: 'Edit Workbench',
      style: 'Post-production bay',
    },
  },
} as const;

export const musicStyleRange = [
  musicPolishAssets.landing.heroGothicStorm,
  musicPolishAssets.landing.rooftopChoreography,
  musicPolishAssets.landing.animatedRainStreet,
  musicPolishAssets.cinema.performanceCloseup,
] as const;

export const musicTalentRange = [
  musicPolishAssets.talent.leadVocalist,
  musicPolishAssets.talent.voiceBooth,
  musicPolishAssets.talent.motionStage,
  musicPolishAssets.talent.faceWardrobe,
] as const;
