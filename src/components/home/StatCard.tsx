import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShineBorder } from '@/components/ui/shine-border';
import { DitherGradient } from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  className?: string;
  index?: number;
}

export const StatCard = ({ 
  icon, 
  label, 
  value, 
  trend, 
  trendDirection = 'neutral',
  className,
  index = 0
}: StatCardProps) => {
  const isNumericValue = typeof value === 'number';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={cn(
        "relative group p-3 sm:p-5 rounded-2xl overflow-hidden transition-all duration-300",
        "bg-white dark:bg-white/[0.03] border border-orange-100 dark:border-[rgba(249,115,22,0.1)]",
        "shadow-sm dark:shadow-none",
        "hover:border-orange-200 dark:hover:border-[rgba(249,115,22,0.3)] hover:shadow-lg dark:hover:shadow-[0_0_35px_rgba(249,115,22,0.12)]",
        "hover:-translate-y-0.5",
        className
      )}
    >
      {/* Shine Border on hover */}
      <ShineBorder
        shineColor={["#f97316", "#d4a574"]}
        borderWidth={1}
        duration={12}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />
      
      {/* Dithered brand wash anchored to the card's base */}
      <DitherGradient
        from={ditherColors.primary}
        direction="up"
        bloom={ditherBloom.perf}
        opacity={0.08}
        className="pointer-events-none absolute inset-x-0 top-auto bottom-0 h-2/3 [mask-image:linear-gradient(to_top,black,transparent)]"
      />

      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(249,115,22,0.03)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      {/* Top shine line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[rgba(249,115,22,0.1)] to-transparent" />
      
      {/* Icon positioned top-right with orange glass effect */}
      <motion.div 
        whileHover={{ scale: 1.1 }}
        className="absolute top-3 right-3 w-9 h-9 sm:top-4 sm:right-4 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[rgba(249,115,22,0.15)] to-[rgba(234,88,12,0.08)] border border-[rgba(249,115,22,0.2)] flex items-center justify-center group-hover:shadow-[0_0_24px_rgba(249,115,22,0.25)] transition-all duration-300"
      >
        <div className="text-[#f97316]">
          {icon}
        </div>
      </motion.div>
      
      <div className="relative z-10">
        {/* Label */}
        <p className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-muted-foreground/70 mb-1 font-semibold uppercase tracking-[0.15em]">
          {label}
        </p>
        
        {/* Value */}
        <div className="flex items-baseline gap-3 mt-2">
          {isNumericValue ? (
            <NumberTicker
              value={value}
              delay={0.3 + index * 0.1}
              className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight"
            />
          ) : (
            <span className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {value}
            </span>
          )}
        </div>
        
        {/* Trend badge */}
        {trend && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + index * 0.1 }}
            className="mt-3"
          >
            <span className={cn(
              "inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm",
              trendDirection === 'up' && "text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/25",
              trendDirection === 'down' && "text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/25",
              trendDirection === 'neutral' && "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber/10 border border-amber-200 dark:border-amber/20"
            )}>
              {trendDirection === 'up' && <TrendingUp className="w-3 h-3" />}
              {trendDirection === 'down' && <TrendingDown className="w-3 h-3" />}
              {trend}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
