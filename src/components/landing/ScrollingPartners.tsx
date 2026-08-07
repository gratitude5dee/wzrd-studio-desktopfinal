import React from 'react';
import storyLogo from '@/assets/logos/story.png';
import thirdwebLogo from '@/assets/logos/thirdweb.webp';
import humantechLogo from '@/assets/logos/humantech.svg';
import elevenlabsLogo from '@/assets/logos/elevenlabs.png';
import anthropicLogo from '@/assets/logos/anthropic.svg';
import fiveDeeLogo from '@/assets/logos/5dee.svg';
import { staticAssetUrl } from '@/lib/staticAsset';

interface Logo {
  id: string;
  name: string;
  image?: string;
  height?: number;
}

const logos: Logo[] = [
  { id: '1', name: '5DEE Studios', image: staticAssetUrl(fiveDeeLogo) },
  { id: '2', name: 'Anthropic', image: staticAssetUrl(anthropicLogo) },
  { id: '4', name: 'ElevenLabs', image: staticAssetUrl(elevenlabsLogo) },
  { id: '5', name: 'Story Protocol', image: staticAssetUrl(storyLogo), height: 44 },
  { id: '6', name: 'Human.tech', image: staticAssetUrl(humantechLogo), height: 44 },
  { id: '7', name: 'Veo 3.1' },
  { id: '9', name: 'Seedream 2' },
  { id: '10', name: 'Seedance 2' },
  { id: '11', name: 'WAN 2.6' },
  { id: '12', name: 'Runway 4.5' },
  { id: '13', name: 'thirdweb', image: staticAssetUrl(thirdwebLogo) },
];

const DEFAULT_HEIGHT = 22;

const ScrollingPartners: React.FC = () => {
  return (
    <section className="py-16 md:py-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-white/30 text-xs uppercase tracking-[0.3em] font-medium mb-10">
          Built With
        </p>
      </div>
      <div className="relative w-full partners-fade-mask">
        <div className="flex animate-marquee" style={{ '--duration': '25s' } as React.CSSProperties}>
          {[...Array(3)].map((_, setIndex) => (
            <div key={setIndex} className="flex items-center shrink-0">
              {logos.map((logo) => (
                <span
                  key={`${setIndex}-${logo.id}`}
                  className="mx-10 md:mx-14 flex items-center justify-center whitespace-nowrap"
                >
                  {logo.image ? (
                    <img
                      src={logo.image}
                      alt={logo.name}
                      style={{ height: logo.height || DEFAULT_HEIGHT }}
                      className="object-contain brightness-0 invert opacity-40 hover:opacity-70 transition-opacity"
                    />
                  ) : (
                    <span
                      className="text-white/40 font-semibold text-lg md:text-xl tracking-tight hover:text-white/70 transition-colors"
                      style={{ lineHeight: `${DEFAULT_HEIGHT}px` }}
                    >
                      {logo.name}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ScrollingPartners;
