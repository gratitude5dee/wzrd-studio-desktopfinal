import { motion } from 'framer-motion';
import googleImg from '@/assets/cards/provider-google.jpg';
import openaiImg from '@/assets/cards/provider-openai.jpg';
import runwayImg from '@/assets/cards/provider-runway.jpg';
import bflImg from '@/assets/cards/provider-bfl.jpg';
import lumaImg from '@/assets/cards/provider-luma.jpg';
import stabilityImg from '@/assets/cards/provider-stability.jpg';
import hailuoImg from '@/assets/cards/provider-hailuo.jpg';
import wanImg from '@/assets/cards/provider-wan.jpg';
import { staticAssetUrl } from '@/lib/staticAsset';

const providers = [
  { name: 'Google', models: ['Gemini 2.5 Flash', 'Imagen 3', 'Veo 2'], image: staticAssetUrl(googleImg) },
  { name: 'OpenAI', models: ['GPT-5', 'GPT-4o Mini', 'GPT Image', 'Sora'], image: staticAssetUrl(openaiImg) },
  { name: 'Runway', models: ['Gen-4 Turbo', 'Runway 4.5', 'Gen-3 Alpha'], image: staticAssetUrl(runwayImg) },
  { name: 'Black Forest Labs', models: ['FLUX.1 Pro', 'FLUX.1 Dev', 'FLUX.1 Schnell'], image: staticAssetUrl(bflImg) },
  { name: 'Luma AI', models: ['Dream Machine', 'Photon', 'Ray 2'], image: staticAssetUrl(lumaImg) },
  { name: 'Stability AI', models: ['SD3.5 Turbo', 'Stable Video', 'SDXL'], image: staticAssetUrl(stabilityImg) },
  { name: 'Hailuo AI', models: ['MiniMax Video', 'Seedance 2', 'Seedream 2'], image: staticAssetUrl(hailuoImg) },
  { name: 'WAN', models: ['WAN 2.6', 'Nanobanana 2', 'WAN-X'], image: staticAssetUrl(wanImg) },
];

export function ModelLibrarySection() {
  return (
    <section className="py-32 px-4 relative">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            One subscription to{' '}
            <em style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} className="bg-clip-text text-transparent bg-gradient-to-r from-orange-300 to-amber-200">
              rule them all.
            </em>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            One plan. 50+ models. Stay on the creative edge without chasing licenses.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {providers.map((provider, i) => (
            <motion.div
              key={provider.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.15] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 relative overflow-hidden"
            >
              {/* Background image */}
              <img src={provider.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity duration-500" />
              {/* Noise overlay */}
              <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
              <div className="relative z-10">
                <h3 className="text-base font-semibold text-white mb-3">{provider.name}</h3>
                <div className="flex flex-col gap-1.5">
                  {provider.models.map((model) => (
                    <span key={model} className="text-xs text-white/40 font-mono">{model}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ModelLibrarySection;
