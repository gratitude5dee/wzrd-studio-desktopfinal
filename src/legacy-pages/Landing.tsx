import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import HeroSection from '@/components/landing/HeroSection';
import { LazySection } from '@/components/landing/LazySection';
import { DitherGradient } from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';
import { shouldShowVideoIntro } from '@/components/landing/VideoIntroOverlay';

const CinematicIntro = lazy(() => import('@/components/landing/CinematicIntro'));
const VideoIntroOverlay = lazy(() => import('@/components/landing/VideoIntroOverlay'));

// Below-fold sections — eagerly imported but rendered via LazySection
import FeatureGrid from '@/components/landing/FeatureGrid';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import FAQAccordion from '@/components/landing/FAQAccordion';
import { PricingSectionRedesigned } from '@/components/landing/PricingSectionRedesigned';
import CinematicHeroAnimatix from '@/components/landing/CinematicHeroAnimatix';
import ScriptToScreenInput from '@/components/landing/ScriptToScreenInput';
import ModelEcosystemGrid from '@/components/landing/ModelEcosystemGrid';
import GovernanceSection from '@/components/landing/GovernanceSection';
import UseCasesShowcase from '@/components/landing/UseCasesShowcase';
import MassiveFooter from '@/components/landing/MassiveFooter';
import { ThreeStepSection } from '@/components/landing/ThreeStepSection';
import { IPhoneMockup } from '@/components/landing/IPhoneMockup';

const SectionDivider = () => (
  <div className="mx-auto max-w-6xl px-4 py-2" aria-hidden="true">
    <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
  </div>
);

const Landing = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [introRequested] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('intro') === '1';
  });
  const [introComplete, setIntroComplete] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (new URLSearchParams(window.location.search).get('intro') !== '1') return true;
    return sessionStorage.getItem('mog-intro-seen') === 'true';
  });
  const [introReady, setIntroReady] = useState(false);
  const [videoIntroActive, setVideoIntroActive] = useState(() => shouldShowVideoIntro());

  const handleVideoIntroComplete = useCallback(() => {
    setVideoIntroActive(false);
  }, []);

  const handleIntroComplete = useCallback(() => {
    sessionStorage.setItem('mog-intro-seen', 'true');
    setIntroComplete(true);
  }, []);

  // Force dark mode on landing
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'system');
    root.classList.add('dark');
  }, []);

  // Gate CinematicIntro behind idle + reduced-motion check
  useEffect(() => {
    if (!introRequested || introComplete) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setIntroComplete(true);
      return;
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => setIntroReady(true), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    } else {
      const t = setTimeout(() => setIntroReady(true), 100);
      return () => clearTimeout(t);
    }
  }, [introComplete, introRequested]);

  // RAF-throttled passive scroll listener
  const rafRef = useRef(0);
  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 50);
        rafRef.current = 0;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const faqItems = [
    { question: 'How does WZRD handle collaboration?', answer: 'Invite collaborators with granular permissions, leave comments on nodes, and keep every timeline change synced in realtime.' },
    { question: 'Can I bring my own assets or models?', answer: 'Yes. Upload existing media, connect external sources, or plug in your preferred AI models directly in the studio.' },
    { question: 'What formats can I export?', answer: 'Export ready-to-publish video in multiple resolutions, codecs, and aspect ratios tailored to every platform.' },
    { question: 'Is WZRD enterprise-ready?', answer: 'Yes. SOC 2 compliant workflows, SSO, team permissions, and audit trails are built in for enterprise teams.' },
  ];

  const handleMobileNavClick = (elementId: string) => {
    setIsMobileMenuOpen(false);
    setTimeout(() => {
      const element = document.getElementById(elementId);
      if (element) {
        const headerOffset = 120;
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });
      }
    }, 100);
  };

  const handleSmoothScroll = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      const headerOffset = 120;
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({ top: elementPosition - headerOffset, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen w-full relative bg-black">
      <AnimatePresence>
        {videoIntroActive && (
          <Suspense fallback={<div className="fixed inset-0 z-[99999] bg-black" />}>
            <VideoIntroOverlay src="/introani.mp4" mobileSrc="/introani-mobile.mp4" onComplete={handleVideoIntroComplete} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!introComplete && introReady && (
          <Suspense fallback={<div className="fixed inset-0 z-[99999] bg-black" />}>
            <CinematicIntro onComplete={handleIntroComplete} />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Desktop Header */}
      <header
        className={`sticky top-3 z-[9999] mx-auto hidden w-full self-start rounded-full border border-white/[0.08] bg-black/75 shadow-2xl shadow-black/45 backdrop-blur-xl transition-all duration-500 md:flex ${isScrolled ? 'max-w-4xl px-3' : 'max-w-6xl px-5'} py-2.5`}
        style={{ willChange: 'transform', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
      >
        <div className="flex items-center justify-between w-full gap-4">
          <Link to="/" onClick={(e) => { if (window.location.pathname === '/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }} className="flex items-center justify-center gap-2 flex-shrink-0 z-50 cursor-pointer">
            <img src="/lovable-uploads/wzrdtechlogo.png" alt="WZRD Studio" className="h-8 object-contain" />
          </Link>

          <nav className="hidden lg:flex flex-1 flex-row items-center justify-center gap-1 text-sm font-medium text-white/50">
            <a className="relative px-3 py-2 text-white/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap" onClick={(e) => { e.preventDefault(); handleSmoothScroll('features'); }}>Features</a>
            <a href="/docs" className="relative px-3 py-2 text-white/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap">Documentation</a>
            <a href="/api" className="relative px-3 py-2 text-white/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap">API</a>
            <a className="relative px-3 py-2 text-white/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap" onClick={(e) => { e.preventDefault(); handleSmoothScroll('pricing'); }}>Pricing</a>
            <a className="relative px-3 py-2 text-white/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap" onClick={(e) => { e.preventDefault(); handleSmoothScroll('testimonials'); }}>Testimonials</a>
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Link to="/demo" className="rounded-md font-medium relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-block text-center border border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] px-4 py-1.5 text-xs sm:text-sm whitespace-nowrap">Demo</Link>
            <Link to="/login" className="font-medium transition-colors hover:text-white text-white/50 text-xs sm:text-sm cursor-pointer whitespace-nowrap">Log In</Link>
            <Link to="/login?mode=signup" className="rounded-md font-bold relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-block text-center bg-gradient-to-b from-[#FF6B4A] to-[#e55a3a] text-white shadow-[0_0_20px_rgba(255,107,74,0.2)] hover:shadow-[0_0_30px_rgba(255,107,74,0.35)] px-4 py-1.5 text-xs sm:text-sm whitespace-nowrap">Sign Up</Link>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="sticky top-4 z-[9999] mx-4 flex w-auto flex-row items-center justify-between rounded-full bg-black/70 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/50 md:hidden px-4 py-3">
        <Link to="/" onClick={(e) => { if (window.location.pathname === '/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }} className="flex items-center justify-center gap-2 cursor-pointer">
          <img src="/lovable-uploads/wzrdtechlogo.png" alt="WZRD Studio" className="h-6 object-contain" />
        </Link>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/[0.08] transition-colors hover:bg-white/10" aria-label="Toggle menu">
          <div className="flex flex-col items-center justify-center w-5 h-5 space-y-1">
            <span className={`block w-4 h-0.5 bg-white transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
            <span className={`block w-4 h-0.5 bg-white transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-4 h-0.5 bg-white transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </div>
        </button>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-md md:hidden">
          <div className="absolute top-20 left-4 right-4 bg-[#111111]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl p-6">
            <nav className="flex flex-col space-y-3">
              <button onClick={() => handleMobileNavClick('features')} className="text-left px-4 py-3 text-lg font-medium text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5">Features</button>
              <Link to="/docs" className="text-left px-4 py-3 text-lg font-medium text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5">Documentation</Link>
              <button onClick={() => handleMobileNavClick('pricing')} className="text-left px-4 py-3 text-lg font-medium text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5">Pricing</button>
              <button onClick={() => handleMobileNavClick('testimonials')} className="text-left px-4 py-3 text-lg font-medium text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5">Testimonials</button>
              <div className="border-t border-white/[0.06] pt-4 mt-4 flex flex-col space-y-3">
                <Link to="/demo" className="px-4 py-3 text-lg font-bold text-center bg-gradient-to-b from-[#FF6B4A] to-[#e55a3a] text-white rounded-xl shadow-lg">Demo</Link>
                <Link to="/login" className="px-4 py-3 text-lg font-medium text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5 cursor-pointer">Log In</Link>
                <Link to="/login?mode=signup" className="px-4 py-3 text-lg font-bold text-center bg-gradient-to-b from-[#FF6B4A] to-[#e55a3a] text-white rounded-xl shadow-lg">Sign Up</Link>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ===== HERO AREA ===== */}
      <div className="relative overflow-hidden">
        <DitherGradient
          from={ditherColors.primary}
          direction="up"
          bloom={ditherBloom.marketing}
          opacity={0.22}
          className="pointer-events-none absolute inset-x-0 top-auto bottom-0 z-0 h-64"
        />
        <div className="relative z-10">
          <HeroSection />
          <SectionDivider />
        </div>
      </div>

      {/* ===== PLATFORM CAPABILITIES SECTIONS ===== */}
      <div className="relative bg-black">
        <LazySection minHeight="400px">
          <CinematicHeroAnimatix />
        </LazySection>
        <LazySection minHeight="300px">
          <ScriptToScreenInput />
        </LazySection>
        <LazySection minHeight="400px">
          <ModelEcosystemGrid />
        </LazySection>
        <LazySection minHeight="300px">
          <GovernanceSection />
        </LazySection>
        <LazySection minHeight="400px">
          <UseCasesShowcase />
        </LazySection>
      </div>

      {/* ===== REST OF PAGE ===== */}
      <div
        className="relative"
        style={{
          background: 'radial-gradient(ellipse 70% 35% at 50% 0%, rgba(255,107,74,0.08) 0%, transparent 60%), linear-gradient(180deg, #000 0%, #050505 42%, #070403 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

        <div className="relative z-10">
          <SectionDivider />

          <LazySection minHeight="400px">
            <div id="features"><FeatureGrid /></div>
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="300px">
            <ThreeStepSection />
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="300px">
            <UseCasesSection />
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="400px">
            <IPhoneMockup />
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="300px">
            <div id="testimonials"><TestimonialsSection /></div>
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="400px">
            <div id="pricing"><PricingSectionRedesigned /></div>
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="200px">
            <div id="faq"><FAQAccordion items={faqItems} /></div>
          </LazySection>

          <SectionDivider />

          <LazySection minHeight="300px">
            <MassiveFooter />
          </LazySection>
        </div>
      </div>
    </div>
  );
};

export default Landing;
