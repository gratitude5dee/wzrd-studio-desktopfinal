 import { useState, useRef, useEffect, useCallback } from 'react';
 import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, Play, Volume2, VolumeX, ChevronUp, ChevronDown, Flame, Clock, TrendingUp, Star, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
 import { useMogFeed, type MogPost, type MogSortType } from '@/hooks/useMogFeed';
 import { Button } from '@/components/ui/button';
 import { cn } from '@/lib/utils';
 
 interface MogVideoCardProps {
   post: MogPost;
   isActive: boolean;
   onLike?: () => void;
   onComment?: () => void;
   onShare?: () => void;
   onBookmark?: () => void;
 }
 
 function MogVideoCard({ post, isActive, onLike, onComment, onShare, onBookmark }: MogVideoCardProps) {
   const videoRef = useRef<HTMLVideoElement>(null);
   const [isPlaying, setIsPlaying] = useState(false);
   const [isMuted, setIsMuted] = useState(true);
   const [liked, setLiked] = useState(false);
   const [bookmarked, setBookmarked] = useState(false);
 
   useEffect(() => {
     if (videoRef.current) {
       if (isActive) {
         videoRef.current.play().catch(() => {});
         setIsPlaying(true);
       } else {
         videoRef.current.pause();
         setIsPlaying(false);
       }
     }
   }, [isActive]);
 
   const togglePlay = () => {
     if (videoRef.current) {
       if (isPlaying) {
         videoRef.current.pause();
       } else {
         videoRef.current.play();
       }
       setIsPlaying(!isPlaying);
     }
   };
 
   const toggleMute = () => {
     if (videoRef.current) {
       videoRef.current.muted = !isMuted;
       setIsMuted(!isMuted);
     }
   };
 
   const handleLike = () => {
     setLiked(!liked);
     onLike?.();
   };
 
   const handleBookmark = () => {
     setBookmarked(!bookmarked);
     onBookmark?.();
   };
 
   const formatCount = (count: number) => {
     if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
     if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
     return count.toString();
   };
 
   return (
    <div className="relative w-full h-full bg-mog-bg flex items-center justify-center">
       {post.content_type === 'video' ? (
         <video
           ref={videoRef}
           src={post.media_url}
           className="w-full h-full object-contain"
           loop
           muted={isMuted}
           playsInline
           onClick={togglePlay}
         />
       ) : (
         <img
           src={post.media_url}
           alt={post.title || 'Mog post'}
           className="w-full h-full object-contain"
         />
       )}
 
      {post.content_type === 'video' && !isPlaying && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-mog-bg/30">
          <Play className="w-16 h-16 text-mog-text/80" />
         </div>
       )}
 
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-mog-bg/80 to-transparent pointer-events-none" />
 
       <div className="absolute bottom-20 left-4 right-20 space-y-3">
         <div className="flex items-center gap-3">
           {post.creator_avatar ? (
             <img
               src={post.creator_avatar}
               alt={post.creator_name}
              className="w-10 h-10 rounded-full border-2 border-mog-coral"
             />
           ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-mog-coral to-mog-coral-light flex items-center justify-center text-mog-text font-bold">
               {post.creator_name[0]?.toUpperCase() || '🦞'}
             </div>
           )}
          <span className="font-semibold text-mog-text">@{post.creator_name}</span>
         </div>
         
         {post.title && (
          <h3 className="text-mog-text font-medium text-lg">{post.title}</h3>
         )}
         
         {post.description && (
          <p className="text-mog-text/80 text-sm line-clamp-2">{post.description}</p>
         )}
         
         {post.hashtags && post.hashtags.length > 0 && (
           <div className="flex flex-wrap gap-2">
             {post.hashtags.slice(0, 5).map((tag, i) => (
              <span key={i} className="text-mog-coral text-sm">#{tag}</span>
             ))}
           </div>
         )}
       </div>
 
       <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6">
         <button
           onClick={handleLike}
           className="flex flex-col items-center gap-1 group"
         >
           <div className={cn(
             "w-12 h-12 rounded-full flex items-center justify-center transition-all",
          liked ? "bg-mog-coral text-mog-text" : "bg-mog-text/10 backdrop-blur-sm text-mog-text hover:bg-mog-text/20"
           )}>
             <Heart className={cn("w-6 h-6", liked && "fill-current")} />
           </div>
        <span className="text-mog-text text-xs font-medium">{formatCount(post.likes_count + (liked ? 1 : 0))}</span>
         </button>
 
         <button
           onClick={onComment}
           className="flex flex-col items-center gap-1 group"
         >
        <div className="w-12 h-12 rounded-full bg-mog-text/10 backdrop-blur-sm flex items-center justify-center text-mog-text hover:bg-mog-text/20 transition-all">
             <MessageCircle className="w-6 h-6" />
           </div>
        <span className="text-mog-text text-xs font-medium">{formatCount(post.comments_count)}</span>
         </button>
 
         <button
           onClick={handleBookmark}
           className="flex flex-col items-center gap-1 group"
         >
           <div className={cn(
             "w-12 h-12 rounded-full flex items-center justify-center transition-all",
          bookmarked ? "bg-mog-coral-light text-mog-text" : "bg-mog-text/10 backdrop-blur-sm text-mog-text hover:bg-mog-text/20"
           )}>
             <Bookmark className={cn("w-6 h-6", bookmarked && "fill-current")} />
           </div>
         </button>
 
         <button
           onClick={onShare}
           className="flex flex-col items-center gap-1 group"
         >
        <div className="w-12 h-12 rounded-full bg-mog-text/10 backdrop-blur-sm flex items-center justify-center text-mog-text hover:bg-mog-text/20 transition-all">
             <Share2 className="w-6 h-6" />
           </div>
        <span className="text-mog-text text-xs font-medium">{formatCount(post.shares_count)}</span>
         </button>
       </div>
 
       {post.content_type === 'video' && (
         <div className="absolute top-4 right-4 flex gap-2">
           <button
             onClick={toggleMute}
          className="w-10 h-10 rounded-full bg-mog-bg/40 backdrop-blur-sm flex items-center justify-center text-mog-text hover:bg-mog-bg/60 transition-all"
           >
             {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
           </button>
         </div>
       )}
     </div>
   );
 }
 
 export default function Mog() {
   const [currentIndex, setCurrentIndex] = useState(0);
   const [sort, setSort] = useState<MogSortType>('new');
   const containerRef = useRef<HTMLDivElement>(null);
   
   const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useMogFeed(sort);
 
   const allPosts = data?.pages.flatMap(page => page.data) || [];
 
   const handleScroll = useCallback((direction: 'up' | 'down') => {
     if (direction === 'down' && currentIndex < allPosts.length - 1) {
       setCurrentIndex(prev => prev + 1);
       if (currentIndex >= allPosts.length - 3 && hasNextPage && !isFetchingNextPage) {
         fetchNextPage();
       }
     } else if (direction === 'up' && currentIndex > 0) {
       setCurrentIndex(prev => prev - 1);
     }
   }, [currentIndex, allPosts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);
 
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       if (e.key === 'ArrowDown' || e.key === 'j') {
         handleScroll('down');
       } else if (e.key === 'ArrowUp' || e.key === 'k') {
         handleScroll('up');
       }
     };
 
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, [handleScroll]);
 
   useEffect(() => {
     let touchStartY = 0;
     let lastScrollTime = 0;
     const scrollCooldown = 500;
 
     const handleWheel = (e: WheelEvent) => {
       const now = Date.now();
       if (now - lastScrollTime < scrollCooldown) return;
       
       if (e.deltaY > 50) {
         handleScroll('down');
         lastScrollTime = now;
       } else if (e.deltaY < -50) {
         handleScroll('up');
         lastScrollTime = now;
       }
     };
 
     const handleTouchStart = (e: TouchEvent) => {
       touchStartY = e.touches[0].clientY;
     };
 
     const handleTouchEnd = (e: TouchEvent) => {
       const touchEndY = e.changedTouches[0].clientY;
       const diff = touchStartY - touchEndY;
 
       if (Math.abs(diff) > 50) {
         if (diff > 0) {
           handleScroll('down');
         } else {
           handleScroll('up');
         }
       }
     };
 
     const container = containerRef.current;
     if (container) {
       container.addEventListener('wheel', handleWheel, { passive: true });
       container.addEventListener('touchstart', handleTouchStart, { passive: true });
       container.addEventListener('touchend', handleTouchEnd, { passive: true });
     }
 
     return () => {
       if (container) {
         container.removeEventListener('wheel', handleWheel);
         container.removeEventListener('touchstart', handleTouchStart);
         container.removeEventListener('touchend', handleTouchEnd);
       }
     };
   }, [handleScroll]);
 
   const sortOptions: { value: MogSortType; label: string; icon: React.ReactNode }[] = [
     { value: 'new', label: 'New', icon: <Clock className="w-4 h-4" /> },
     { value: 'hot', label: 'Hot', icon: <Flame className="w-4 h-4" /> },
     { value: 'trending', label: 'Trending', icon: <TrendingUp className="w-4 h-4" /> },
     { value: 'top', label: 'Top', icon: <Star className="w-4 h-4" /> },
   ];
 
   if (isLoading) {
     return (
       <div className="h-screen bg-background flex items-center justify-center">
         <div className="text-center space-y-4">
           <div className="text-6xl animate-bounce">🦞</div>
           <p className="text-foreground">Loading Mog...</p>
         </div>
       </div>
     );
   }
 
   if (error) {
     return (
       <div className="h-screen bg-background flex items-center justify-center">
         <div className="text-center space-y-4">
           <div className="text-6xl">😢</div>
           <p className="text-foreground">Failed to load feed</p>
           <Button onClick={() => window.location.reload()} variant="outline">
             Try Again
           </Button>
         </div>
       </div>
     );
   }
 
   if (allPosts.length === 0) {
     return (
       <div className="h-screen bg-background flex items-center justify-center">
         <div className="text-center space-y-4">
           <div className="text-6xl">🦞</div>
           <p className="text-foreground text-xl">No mogs yet!</p>
           <p className="text-muted-foreground">Be the first to post content</p>
         </div>
       </div>
     );
   }
 
   return (
     <div 
       ref={containerRef}
      className="h-screen bg-mog-bg overflow-hidden relative"
     >
      {/* API Docs Link */}
      <Link
        to="/mog/docs"
        className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-mog-bg/60 backdrop-blur-sm flex items-center justify-center text-mog-text hover:bg-mog-surface transition-all border border-mog-text/10"
        title="API Documentation"
      >
        <FileText className="w-5 h-5" />
      </Link>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-mog-bg/40 backdrop-blur-md rounded-full p-1 border border-mog-text/10">
         {sortOptions.map(option => (
           <button
             key={option.value}
             onClick={() => {
               setSort(option.value);
               setCurrentIndex(0);
             }}
             className={cn(
               "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all",
               sort === option.value
                ? "bg-mog-coral text-mog-text"
                : "text-mog-text-muted hover:text-mog-text hover:bg-mog-text/10"
             )}
           >
             {option.icon}
             {option.label}
           </button>
         ))}
       </div>
 
       <div className="absolute left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
         <button
           onClick={() => handleScroll('up')}
           disabled={currentIndex === 0}
          className="w-10 h-10 rounded-full bg-mog-bg/40 backdrop-blur-sm flex items-center justify-center text-mog-text disabled:opacity-30 hover:bg-mog-bg/60 transition-all"
         >
           <ChevronUp className="w-5 h-5" />
         </button>
         <button
           onClick={() => handleScroll('down')}
           disabled={currentIndex >= allPosts.length - 1}
          className="w-10 h-10 rounded-full bg-mog-bg/40 backdrop-blur-sm flex items-center justify-center text-mog-text disabled:opacity-30 hover:bg-mog-bg/60 transition-all"
         >
           <ChevronDown className="w-5 h-5" />
         </button>
       </div>
 
      <div className="absolute bottom-4 left-4 z-50 bg-mog-bg/40 backdrop-blur-sm rounded-full px-3 py-1 text-mog-text/80 text-sm">
         {currentIndex + 1} / {allPosts.length}
       </div>
 
       <AnimatePresence mode="wait">
         <motion.div
           key={allPosts[currentIndex]?.id || 'empty'}
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -20 }}
           transition={{ duration: 0.2 }}
           className="h-full w-full"
         >
           {allPosts[currentIndex] && (
             <MogVideoCard
               post={allPosts[currentIndex]}
               isActive={true}
             />
           )}
         </motion.div>
       </AnimatePresence>
 
       {isFetchingNextPage && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-mog-bg/60 backdrop-blur-sm rounded-full px-4 py-2 text-mog-text text-sm flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-mog-coral border-t-transparent rounded-full animate-spin" />
           Loading more...
         </div>
       )}
     </div>
   );
 }