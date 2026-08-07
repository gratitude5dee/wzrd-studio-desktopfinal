import { Link } from 'react-router-dom';
import { Github, Twitter, Linkedin, Youtube, ArrowUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { motion } from 'framer-motion';
import wzrdLogo from '@/assets/wzrd-logo.png';
import { staticAssetUrl } from '@/lib/staticAsset';

export function StickyFooter() {
  const [email, setEmail] = useState('');

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail('');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-black border-t border-white/[0.06] py-16 px-4 relative overflow-hidden">
      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Newsletter */}
        <div className="bg-white/[0.02] rounded-2xl p-8 mb-16 border border-white/[0.06]">
          <div className="max-w-xl mx-auto text-center">
            <h3 className="text-2xl font-bold text-white mb-2">Stay Updated</h3>
            <p className="text-white/40 mb-6 text-sm">Get the latest AI workflow tips and product updates.</p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 focus:border-orange-500/50"
                required
              />
              <Button type="submit" className="bg-gradient-to-b from-[#FF6B4A] to-[#e55a3a] hover:from-[#e55a3a] hover:to-[#c2410c] text-white">
                Subscribe
              </Button>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="inline-block mb-4">
              <img src={staticAssetUrl(wzrdLogo)} alt="WZRD" className="h-10 w-auto" />
            </Link>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs mb-4">
              The agentic video editor that helps you create stunning content 10x faster.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors"><Twitter className="w-4 h-4" /></a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors"><Youtube className="w-4 h-4" /></a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors"><Linkedin className="w-4 h-4" /></a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors"><Github className="w-4 h-4" /></a>
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">Company</h4>
            <ul className="space-y-2.5">
              {['Blog', 'Careers', 'Community', 'Contact'].map((link) => (
                <li key={link}><a href="#" className="text-sm text-white/30 hover:text-white/60 transition-colors">{link}</a></li>
              ))}
            </ul>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">Product</h4>
            <ul className="space-y-2.5">
              {['Updates', 'Pricing', 'Teams', 'Capabilities'].map((link) => (
                <li key={link}><a href="#" className="text-sm text-white/30 hover:text-white/60 transition-colors">{link}</a></li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">Resources</h4>
            <ul className="space-y-2.5">
              {['Docs', 'Support', 'Legal', 'Status'].map((link) => (
                <li key={link}><a href="#" className="text-sm text-white/30 hover:text-white/60 transition-colors">{link}</a></li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-white/30 text-xs">© {new Date().getFullYear()} WZRD Inc. All rights reserved.</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-white/30">All systems operational</span>
            </div>
          </div>

          <motion.button
            onClick={scrollToTop}
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-all"
            aria-label="Back to top"
          >
            <ArrowUp className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </footer>
  );
}
