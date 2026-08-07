import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play, ArrowDown, Film, Music, Type, Sparkles, Layers, SkipBack, SkipForward, Volume2, Search, Plus, Send } from 'lucide-react';
import ScrollingPartners from '@/components/landing/ScrollingPartners';
import { SmartVideo } from '@/components/media/SmartVideo';
import { heroVideo } from '@/lib/brandMedia';
import { musicStyleRange } from '@/lib/musicPolishAssets';
import { DitherGradient } from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';

interface HeroSectionProps {
  headline?: string;
  subheadline?: string;
}

export function HeroSection({ 
  headline, 
  subheadline = "Create music-video worlds, lyric plates, artist references, and production-ready visual assets in one studio workflow."
}: HeroSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Scrub playhead from 5% to 92% as user scrolls through the hero
  const playheadLeft = useTransform(scrollYProgress, [0, 1], [5, 92]);
  const playheadLeftCalc = useTransform(playheadLeft, v => `calc(${v}% + 3.5rem)`);

  const [timecode, setTimecode] = useState('00:00:00 / 01:02:34');
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const totalSecs = Math.floor(v * 3754); // 01:02:34 = 3754s
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const h = Math.floor(m / 60);
    setTimecode(`${String(h).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}:${String(s).padStart(2,'0')} / 01:02:34`);
  });

  const scrollToContent = () => {
    window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
  };

  return (
    <section ref={sectionRef} className="relative flex min-h-[145vh] items-start justify-center overflow-hidden">
      <div className="sticky top-0 flex min-h-screen w-full items-center justify-center py-14 md:py-16">
      {/* Gradient accents */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 70% 46% at 50% -10%, rgba(255,107,74,0.16), transparent 70%),
            radial-gradient(ellipse 34% 28% at 82% 20%, rgba(45,212,191,0.06), transparent 62%),
            linear-gradient(180deg, rgba(255,255,255,0.02), transparent 42%)
          `,
        }}
      />

      {/* Dithered wash layered over the radial accents */}
      <DitherGradient
        from={ditherColors.primary}
        direction="up"
        bloom={ditherBloom.marketing}
        opacity={0.35}
        className="pointer-events-none absolute inset-x-0 top-auto bottom-0 -z-10 h-1/2"
      />

      <div className="relative z-10 container mx-auto px-4">
        <div className="max-w-5xl mx-auto text-center">
          {/* Pill Badge — above editor */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mb-6 md:mb-9"
          >
            <span className="relative inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-1.5 md:py-2 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-300 text-[10px] md:text-xs font-medium tracking-wide shadow-[0_0_15px_rgba(249,115,22,0.12),0_0_30px_rgba(45,212,191,0.04)]"
              style={{
                animation: 'glowStroke 3s ease-in-out infinite',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shadow-[0_0_6px_rgba(249,115,22,0.6)]" />
              New: 200+ Generative Models now available on WZRD.studio
              <Link to="/login?mode=signup" className="text-orange-300 hover:text-orange-200 underline underline-offset-2 ml-1 transition-colors">Try now →</Link>
            </span>
          </motion.div>

          {/* Mock Editor Panel */}
          <motion.div
            className="relative z-20 mx-auto mb-8 max-w-3xl md:mb-9"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1 }}
          >
            <div className="bg-[#0c0c0c] border border-white/[0.08] rounded-lg overflow-hidden shadow-2xl shadow-black/60">
              {/* Top Bar */}
              <div className="flex items-center justify-between px-4 py-2 bg-white/[0.04] border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-red-500" />
                  <span className="text-[11px] text-white/70 font-mono font-bold tracking-wider uppercase">WZRD.studio</span>
                </div>
                <span className="hidden text-[10px] text-white/30 font-mono tracking-wide sm:inline">Project Timeline</span>
                <div className="hidden items-center gap-3 sm:flex">
                  <button className="text-[10px] text-white/50 font-mono bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1 rounded-md transition-colors">Export</button>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6),0_0_16px_rgba(52,211,153,0.3)]" />
                    <span className="text-[10px] text-emerald-400 font-mono" style={{ textShadow: '0 0 8px rgba(52,211,153,0.4)' }}>Ready</span>
                  </div>
                </div>
              </div>

              <div className="flex" style={{ minHeight: 'clamp(240px, 32vw, 340px)' }}>
                {/* Left Icon Bar */}
                <div className="hidden w-12 border-r border-white/[0.06] bg-white/[0.02] flex-col items-center py-3 gap-1 sm:flex">
                  {[
                    { icon: Film, active: true },
                    { icon: Music, active: false },
                    { icon: Type, active: false },
                    { icon: Sparkles, active: false },
                    { icon: Layers, active: false },
                  ].map(({ icon: Icon, active }, i) => (
                    <div
                      key={i}
                      className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                        active
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  ))}

                  {/* Media Library below icons */}
                  <div className="mt-auto w-full px-1">
                    <div className="border-t border-white/[0.06] pt-2">
                      <span className="text-[7px] text-white/30 font-mono uppercase tracking-wider block text-center mb-1.5">Media</span>
                      <div className="flex items-center bg-white/[0.03] rounded px-1 py-0.5 mb-1.5">
                        <Search className="w-2.5 h-2.5 text-white/20" />
                      </div>
                      <div className="grid grid-cols-2 gap-0.5">
                        {musicStyleRange.map((asset) => (
                          <div key={asset.title} className="aspect-square overflow-hidden rounded-sm border border-white/[0.06] bg-white/[0.04]">
                            <img
                              src={asset.src}
                              alt=""
                              className="h-full w-full object-cover opacity-75"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        ))}
                      </div>
                      <button className="mt-1.5 flex w-full items-center justify-center rounded-sm border border-white/[0.06] bg-white/[0.03] py-1 text-white/25 transition-colors hover:text-orange-300" aria-label="Add media">
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col">
                  {/* Preview Window */}
                  <div className="flex-1 p-3">
                    <div className="bg-black rounded-lg h-full flex items-center justify-center border border-white/[0.05] relative overflow-hidden min-h-[120px]">
                      <SmartVideo
                        poster={heroVideo.poster}
                        sources={[...heroVideo.sources]}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/5" />
                    </div>
                  </div>

                  {/* Transport Controls */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <SkipBack className="w-3.5 h-3.5 text-white/25 hover:text-white/50 cursor-pointer transition-colors" />
                      <div className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.12] flex items-center justify-center cursor-pointer transition-all">
                        <Play className="w-3 h-3 text-white/60 ml-0.5" />
                      </div>
                      <SkipForward className="w-3.5 h-3.5 text-white/25 hover:text-white/50 cursor-pointer transition-colors" />
                      <span className="text-[10px] text-white/25 font-mono ml-2">{timecode}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-white/25 font-mono">100%</span>
                      <Volume2 className="w-3.5 h-3.5 text-white/25 hover:text-white/50 cursor-pointer transition-colors" />
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="border-t border-white/[0.06]">
                    <div className="flex items-end px-4 pt-2 pb-1 ml-14">
                      {['00:00', '00:15', '00:30', '00:45', '01:00'].map((t, i) => (
                        <div key={i} className="flex-1 relative">
                          <div className="absolute left-0 bottom-0 w-px h-2 bg-white/10" />
                          <span className="text-[8px] text-white/20 font-mono absolute left-0 -top-0.5">{t}</span>
                        </div>
                      ))}
                    </div>

                    <div className="relative pb-3">
                      <motion.div className="absolute top-0 bottom-0 z-10 w-px bg-orange-400/70 shadow-[0_0_6px_rgba(251,146,60,0.3)]" style={{ left: playheadLeftCalc }}>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-orange-400" />
                      </motion.div>

                      <div className="flex items-center gap-3 px-4 py-1">
                        <span className="text-[9px] text-white/25 w-10 sm:w-12 text-right font-mono shrink-0 uppercase tracking-wide">B-Roll</span>
                        <div className="flex-1 h-7 bg-white/[0.015] rounded relative overflow-hidden">
                          <div className="absolute left-[5%] top-1 bottom-1 w-[22%] rounded-sm bg-cyan-500/20 border border-cyan-300/15 hover:bg-cyan-500/30 hover:shadow-[0_0_8px_rgba(34,211,238,0.16)] transition-all cursor-pointer" />
                          <div className="absolute left-[32%] top-1 bottom-1 w-[12%] rounded-sm bg-cyan-500/12 border border-cyan-300/10 hover:bg-cyan-500/22 transition-all cursor-pointer" />
                          <div className="absolute left-[58%] top-1 bottom-1 w-[18%] rounded-sm bg-cyan-500/16 border border-cyan-300/12 hover:bg-cyan-500/26 hover:shadow-[0_0_8px_rgba(34,211,238,0.12)] transition-all cursor-pointer" />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 px-4 py-1">
                        <span className="text-[9px] text-white/25 w-10 sm:w-12 text-right font-mono shrink-0 uppercase tracking-wide">Main</span>
                        <div className="flex-1 h-7 bg-white/[0.015] rounded relative overflow-hidden">
                          <div className="absolute left-[2%] top-1 bottom-1 w-[40%] rounded-sm bg-gradient-to-r from-orange-500/30 to-orange-500/20 border border-orange-400/20 hover:from-orange-500/40 hover:to-orange-500/30 hover:shadow-[0_0_10px_rgba(251,146,60,0.2)] transition-all cursor-pointer">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex gap-px">
                                {[...Array(8)].map((_, i) => (
                                  <div key={i} className="w-1 bg-orange-300/20 rounded-full" style={{ height: `${8 + Math.sin(i) * 6}px` }} />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="absolute left-[45%] top-1 bottom-1 w-[28%] rounded-sm bg-gradient-to-r from-orange-500/25 to-orange-500/15 border border-orange-400/15 hover:from-orange-500/35 hover:to-orange-500/25 transition-all cursor-pointer" />
                          <div className="absolute left-[76%] top-1 bottom-1 w-[18%] rounded-sm bg-orange-500/20 border border-orange-400/12 hover:bg-orange-500/30 transition-all cursor-pointer" />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 px-4 py-1">
                        <span className="text-[9px] text-white/25 w-10 sm:w-12 text-right font-mono shrink-0 uppercase tracking-wide">Music</span>
                        <div className="flex-1 h-7 bg-white/[0.015] rounded relative overflow-hidden">
                          <div className="absolute left-0 top-1 bottom-1 w-[88%] rounded-sm bg-emerald-500/15 border border-emerald-400/12 hover:bg-emerald-500/25 hover:shadow-[0_0_8px_rgba(52,211,153,0.15)] transition-all cursor-pointer">
                            <div className="absolute inset-0 flex items-center px-1 gap-px overflow-hidden">
                              {[...Array(40)].map((_, i) => (
                                <div
                                  key={i}
                                  className="w-0.5 bg-emerald-400/20 rounded-full shrink-0"
                                  style={{ height: `${3 + Math.abs(Math.sin(i * 0.7)) * 12}px` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Director Panel */}
                <div className="hidden w-44 border-l border-white/[0.06] bg-white/[0.02] flex-col lg:flex">
                  <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-white/[0.06]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]" />
                    <span className="text-[10px] text-white/50 font-mono font-semibold tracking-wider uppercase">Director</span>
                  </div>

                  <div className="flex-1 p-2.5 space-y-2 overflow-hidden">
                    <div className="bg-white/[0.04] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                      <p className="text-[9px] text-white/35 leading-relaxed">Analyzing footage pacing…</p>
                    </div>
                    <div className="bg-white/[0.04] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                      <p className="text-[9px] text-white/35 leading-relaxed">"Cut at 1:24 is 2s too long. Tightening."</p>
                    </div>
                    <div className="bg-orange-500/[0.08] rounded-lg px-2.5 py-2 border border-orange-500/[0.12]">
                      <p className="text-[9px] text-orange-400/50 leading-relaxed">"Adding cinematic LUT to B-roll clips…"</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
                      <p className="text-[9px] text-white/20 leading-relaxed italic">Planning the next cut…</p>
                    </div>
                  </div>

                  <div className="p-2.5 border-t border-white/[0.06]">
                    <div className="flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                      <span className="text-[9px] text-white/20 flex-1 truncate">What story do you want to tell?</span>
                      <Send className="w-3 h-3 text-white/20 hover:text-orange-400/60 cursor-pointer transition-colors shrink-0" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>


          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-normal leading-[1.02] mb-3 md:mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60"
          >
            {headline || <>A <em className="font-serif italic not-italic bg-clip-text text-transparent bg-gradient-to-r from-orange-300 to-amber-200" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>music video</em> studio<br />in your pocket.</>}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="text-sm sm:text-base md:text-lg lg:text-xl text-white/50 max-w-xl mx-auto leading-relaxed font-light mb-6 md:mb-7 px-2 md:px-0"
          >
            {subheadline}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-6 pb-6 md:pb-0"
          >
            <Link
              to="/login?mode=signup"
              className="group inline-flex items-center gap-2 md:gap-2.5 px-6 md:px-8 py-3 md:py-4 bg-white text-black font-semibold rounded-lg hover:bg-white/90 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(255,255,255,0.15)] transition-all duration-200 text-sm md:text-base w-full sm:w-auto justify-center"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              to="/demo"
              className="inline-flex items-center gap-2 md:gap-2.5 px-6 md:px-8 py-3 md:py-4 border border-white/10 text-white/80 font-medium rounded-lg hover:bg-white/[0.05] hover:border-white/20 transition-all duration-200 text-sm md:text-base w-full sm:w-auto justify-center"
            >
              <Play className="w-4 h-4" />
              Watch Demo
            </Link>
          </motion.div>
        </div>

          {/* Built With Partners */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mt-5 md:mt-7"
          >
            <ScrollingPartners />
          </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 cursor-pointer"
          onClick={scrollToContent}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-white/20 uppercase tracking-widest">Scroll</span>
            <ArrowDown className="w-4 h-4 text-white/20 animate-bounce" />
          </div>
        </motion.div>
      </div>
      </div>
    </section>
  );
}

export default HeroSection;
