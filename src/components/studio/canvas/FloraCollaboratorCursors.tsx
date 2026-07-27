import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PresenceUser } from '@/hooks/usePresence';

interface FloraCollaboratorCursorsProps {
  users: Record<string, PresenceUser>;
  currentUserId?: string;
}

const FLORA_COLORS = ['#f97316', '#B85050', '#A0AA32', '#4D8DFF'];

const pointerPath = 'M5.5 4L18.5 11L11 13.5L8.5 21L5.5 4Z';

const getCursorColor = (seed: string) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return FLORA_COLORS[hash % FLORA_COLORS.length];
};

const FloraCursor = memo(function FloraCursor({
  x,
  y,
  username,
  color,
}: {
  x?: number;
  y?: number;
  username: string;
  color: string;
}) {
  return (
  <motion.div
    className="pointer-events-none absolute z-[70]"
    style={{
      left: x,
      top: y,
    }}
    initial={{ opacity: 0 }}
    animate={{
      opacity: 1,
      x: 0,
      y: 0,
    }}
    exit={{ opacity: 0 }}
    transition={{
      type: 'spring',
      stiffness: 380,
      damping: 30,
      mass: 0.45,
    }}
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}
    >
      <path d={pointerPath} fill={color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
    <div
      className="ml-5 -mt-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white shadow-lg"
      style={{
        backgroundColor: `${color}CC`,
      }}
    >
      {username}
    </div>
  </motion.div>
  );
});

export const FloraCollaboratorCursors = memo(function FloraCollaboratorCursors({
  users,
  currentUserId,
}: FloraCollaboratorCursorsProps) {
  const collaborators = useMemo(
    () =>
      Object.values(users)
        .filter((user) => user.userId !== currentUserId && user.cursor)
        .map((user) => ({
          id: user.userId,
          username: user.username || 'Anonymous',
          x: user.cursor?.x ?? 0,
          y: user.cursor?.y ?? 0,
          color: user.color || getCursorColor(user.userId),
        })),
    [currentUserId, users]
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {collaborators.map((cursor) => (
          <FloraCursor
            key={cursor.id}
            x={cursor.x}
            y={cursor.y}
            username={cursor.username}
            color={cursor.color}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});
