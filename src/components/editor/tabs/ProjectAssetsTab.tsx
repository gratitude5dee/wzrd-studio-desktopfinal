import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Image as ImageIcon, Film, Music, FolderOpen, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useVideoEditorStore, type LibraryMediaItem } from '@/store/videoEditorStore';
import { MediaItem } from '../media/MediaItem';
import { editorTheme, typography } from '@/lib/editor/theme';

type MediaFilter = 'all' | 'image' | 'video' | 'audio';

interface ProjectAssetsTabProps {
  projectId?: string;
}

export const ProjectAssetsTab: React.FC<ProjectAssetsTabProps> = ({ projectId }) => {
  const items = useVideoEditorStore((state) => state.mediaLibrary.items);
  const isLoading = useVideoEditorStore((state) => state.mediaLibrary.isLoading);
  const loadMediaLibrary = useVideoEditorStore((state) => state.loadMediaLibrary);
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Load media library when projectId changes
  useEffect(() => {
    if (projectId) {
      loadMediaLibrary(projectId);
    }
  }, [projectId, loadMediaLibrary]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filter !== 'all') {
      result = result.filter((item) => item.mediaType === filter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(query));
    }
    return result;
  }, [items, filter, searchQuery]);

  const filterCounts = useMemo(() => {
    return {
      all: items.length,
      image: items.filter((i) => i.mediaType === 'image').length,
      video: items.filter((i) => i.mediaType === 'video').length,
      audio: items.filter((i) => i.mediaType === 'audio').length,
    };
  }, [items]);

  const FILTER_OPTIONS: { key: MediaFilter; label: string; icon: LucideIcon }[] = [
    { key: 'all', label: 'All', icon: FolderOpen },
    { key: 'image', label: 'Images', icon: ImageIcon },
    { key: 'video', label: 'Videos', icon: Film },
    { key: 'audio', label: 'Audio', icon: Music },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 gap-3">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: editorTheme.accent.primary }}
        />
        <p style={{ color: editorTheme.text.tertiary, fontSize: typography.fontSize.sm }}>
          Loading project assets…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            size={14}
            style={{ color: editorTheme.text.tertiary }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 transition-all"
            style={{
              background: editorTheme.bg.tertiary,
              border: `1px solid ${editorTheme.border.subtle}`,
              color: editorTheme.text.primary,
              fontSize: typography.fontSize.sm,
              
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = editorTheme.border.focus;
              e.currentTarget.style.boxShadow = `0 0 0 2px ${editorTheme.border.focus}33`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = editorTheme.border.subtle;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-1.5 px-3 pb-2">
        {FILTER_OPTIONS.map(({ key, label, icon: Icon }) => {
          const isActive = filter === key;
          const count = filterCounts[key];
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors text-xs"
              style={{
                background: isActive ? editorTheme.accent.primary + '20' : editorTheme.bg.tertiary,
                color: isActive ? editorTheme.accent.primary : editorTheme.text.secondary,
                border: `1px solid ${isActive ? editorTheme.accent.primary + '40' : editorTheme.border.subtle}`,
              }}
            >
              <Icon size={12} />
              <span>{label}</span>
              {count > 0 && (
                <span
                  className="ml-0.5 tabular-nums"
                  style={{ opacity: 0.7, fontSize: '10px' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Asset Grid/List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <FolderOpen
              className="mb-3"
              size={40}
              style={{ color: editorTheme.text.tertiary, opacity: 0.5 }}
            />
            <p
              style={{
                color: editorTheme.text.secondary,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
              }}
            >
              {items.length === 0 ? 'No assets yet' : 'No matching assets'}
            </p>
            <p
              className="mt-1 max-w-[200px]"
              style={{ color: editorTheme.text.tertiary, fontSize: typography.fontSize.xs }}
            >
              {items.length === 0
                ? 'Upload files or generate assets in Project Setup or Studio to see them here.'
                : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 gap-2'
                : 'flex flex-col gap-1.5'
            }
          >
            {filteredItems.map((item) => (
              <MediaItem key={item.id} item={item} viewMode={viewMode} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

ProjectAssetsTab.displayName = 'ProjectAssetsTab';
