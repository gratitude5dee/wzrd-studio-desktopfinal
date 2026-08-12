import cameraFollows from '@/assets/generated/kanvas/starter/camera/camera-follows-v01.webp';
import handheld from '@/assets/generated/kanvas/starter/camera/handheld-v01.webp';
import panLeft from '@/assets/generated/kanvas/starter/camera/pan-left-v01.webp';
import staticCamera from '@/assets/generated/kanvas/starter/camera/static-v01.webp';
import zoomIn from '@/assets/generated/kanvas/starter/camera/zoom-in-v01.webp';
import zoomOut from '@/assets/generated/kanvas/starter/camera/zoom-out-v01.webp';
import gothicStorm from '@/assets/generated/kanvas/starter/lyrics/gothic-storm-v01.webp';
import editAfter from '@/assets/generated/kanvas/starter/video-edit/example-after-v01.webp';
import editBefore from '@/assets/generated/kanvas/starter/video-edit/example-before-v01.webp';
import worldviewCamera from '@/assets/generated/kanvas/starter/worldview/camera-takes-v01.webp';
import worldviewImage from '@/assets/generated/kanvas/starter/worldview/image-to-world-v01.webp';
import worldviewComposer from '@/assets/generated/kanvas/starter/worldview/shot-composer-v01.webp';
import worldviewText from '@/assets/generated/kanvas/starter/worldview/text-to-world-v01.webp';
import countryBlueHour from '@/assets/generated/kanvas/starter/v2/music/country-blue-hour-v02.jpg';
import hipHopNight from '@/assets/generated/kanvas/starter/v2/music/hip-hop-night-v02.jpg';
import rnbBlueRoom from '@/assets/generated/kanvas/starter/v2/music/rnb-blue-room-v02.jpg';
import technoWarehouse from '@/assets/generated/kanvas/starter/v2/music/techno-warehouse-v02.jpg';
import headphonesCobalt from '@/assets/generated/kanvas/starter/v2/ecommerce/headphones-cobalt-v02.jpg';
import vinylMerch from '@/assets/generated/kanvas/starter/v2/ecommerce/vinyl-merch-v02.jpg';
import afrobeatsRooftop from '@/assets/generated/kanvas/starter/v3/music/afrobeats-rooftop-v03.jpg';
import indieGreenhouse from '@/assets/generated/kanvas/starter/v3/music/indie-greenhouse-v03.jpg';
import latinPopCourtyard from '@/assets/generated/kanvas/starter/v3/music/latin-pop-courtyard-v03.jpg';
import automotiveBlueHour from '@/assets/generated/kanvas/starter/v3/ecommerce/automotive-blue-hour-v03.jpg';
import beautyCrimson from '@/assets/generated/kanvas/starter/v3/ecommerce/beauty-crimson-v03.jpg';
import streetwearSneaker from '@/assets/generated/kanvas/starter/v3/ecommerce/streetwear-sneaker-v03.jpg';
import { staticAssetUrl } from '@/lib/staticAsset';

export type KanvasStarterAsset = {
  id: string;
  src: string;
  alt: string;
  label: 'Example';
};

const example = (id: string, src: string, alt: string): KanvasStarterAsset => ({
  id,
  src: staticAssetUrl(src),
  alt,
  label: 'Example',
});

export const kanvasStarterAssets = {
  worldview: {
    text: example('KANVAS-WORLD-TEXT-v01', worldviewText, 'Coastal concrete observatory above tidal pools at first light.'),
    image: example('KANVAS-WORLD-IMAGE-v01', worldviewImage, 'A miniature mountain valley on an artist’s workbench expanding into a real landscape.'),
    camera: example('KANVAS-WORLD-CAMERA-v01', worldviewCamera, 'A concrete promenade frames a rain-bright ocean view.'),
    composer: example('KANVAS-WORLD-COMPOSER-v01', worldviewComposer, 'A performer in a vast glasshouse reflected in a mirror floor.'),
  },
  camera: {
    Static: example('KANVAS-CAMERA-STATIC-v01', staticCamera, 'Wide still of a musician in a dark rehearsal theatre.'),
    Handheld: example('KANVAS-CAMERA-HANDHELD-v01', handheld, 'Close off-axis rehearsal-theatre music shot.'),
    'Zoom Out': example('KANVAS-CAMERA-ZOOM-OUT-v01', zoomOut, 'Tight theatre composition with a wide reveal around the musician.'),
    'Zoom In': example('KANVAS-CAMERA-ZOOM-IN-v01', zoomIn, 'Theatre frame focused on musician and microphone.'),
    'Camera Follows': example('KANVAS-CAMERA-FOLLOWS-v01', cameraFollows, 'Side-tracking profile through theatre curtains.'),
    'Pan Left': example('KANVAS-CAMERA-PAN-LEFT-v01', panLeft, 'Right-weighted theatre frame ready for a leftward reveal.'),
  },
  videoEdit: {
    before: example('KANVAS-EDIT-DEMO-BEFORE-v01', editBefore, 'Example edit input: vocalist before a pale hanging fabric backdrop.'),
    after: example('KANVAS-EDIT-DEMO-AFTER-v01', editAfter, 'Example edit output: the same vocalist before reflective silver hanging ribbons.'),
  },
  lyrics: {
    gothicStorm: example('KANVAS-LYRICS-GOTHIC-STORM-v01', gothicStorm, 'Rainy dark stone arcade with a quiet central area for lyrics.'),
  },
  music: {
    hipHop: example('KANVAS-MUSIC-HIPHOP-v02', hipHopNight, 'Hip-hop artist beside a lowrider and speaker stack on a rain-slick city street.'),
    rnb: example('KANVAS-MUSIC-RNB-v02', rnbBlueRoom, 'R&B singer in a midnight-blue performance room with a vintage microphone.'),
    country: example('KANVAS-MUSIC-COUNTRY-v02', countryBlueHour, 'Country artist performing at a desert roadhouse during blue hour.'),
    techno: example('KANVAS-MUSIC-TECHNO-v02', technoWarehouse, 'Techno DJ at a modular synthesizer in a concrete warehouse rave.'),
    afrobeats: example('KANVAS-MUSIC-AFROBEATS-v03', afrobeatsRooftop, 'Afrobeats singer on a sunlit rooftop with live percussion and a coastal city skyline.'),
    latinPop: example('KANVAS-MUSIC-LATINPOP-v03', latinPopCourtyard, 'Latin pop artist in a rain-glossed courtyard under warm carnival bulbs.'),
    indie: example('KANVAS-MUSIC-INDIE-v03', indieGreenhouse, 'Indie guitarist performing in a candlelit greenhouse after rain.'),
  },
  ecommerce: {
    headphones: example('KANVAS-ECOM-HEADPHONES-v02', headphonesCobalt, 'Matte black headphones displayed on a chrome plinth in a cobalt fashion set.'),
    vinylMerch: example('KANVAS-ECOM-VINYL-v02', vinylMerch, 'Vinyl record and fragrance bottle staged as a premium backstage merch campaign.'),
    streetwear: example('KANVAS-ECOM-STREETWEAR-v03', streetwearSneaker, 'Black and cobalt sneaker floating inside a brutalist concrete campaign set.'),
    beauty: example('KANVAS-ECOM-BEAUTY-v03', beautyCrimson, 'Rose-glass perfume and lipstick on a crimson lacquer pedestal.'),
    automotive: example('KANVAS-ECOM-AUTO-v03', automotiveBlueHour, 'Silver performance coupe at an empty desert gas station during blue hour.'),
  },
} as const;
