import { usePersonStorage } from '@/context/PeopleContext';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_PLAYLIST_REMINDER_SETTINGS, mergePlaylistCatalog, parsePlaylists, validatePlaylist, type RoutinePlaylist } from '@/lib/playlists';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import type { RoutineNotificationSettings } from '@/types/routines';

const KEY = '@routine-flow/playlists';
type PlaylistContextValue = {
  playlists: RoutinePlaylist[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  savePlaylist: (
    title: string, routineIds: string[], id?: string, skillIds?: string[], rateSkillsAtPlaylistEnd?: boolean,
    reminderSettings?: RoutineNotificationSettings,
  ) => Promise<RoutinePlaylist>;
  mergeImportedPlaylists: (playlists: RoutinePlaylist[]) => Promise<{
    added: number; skipped: number; renamed: number; updated: number; idMap: Record<string, string>;
  }>;
  deletePlaylist: (id: string) => Promise<void>;
  removeSkillAssignments: (skillId: string) => Promise<void>;
};
const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const AsyncStorage = usePersonStorage();
  const [playlists, setPlaylists] = useState<RoutinePlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const current = useRef<RoutinePlaylist[]>([]);
  const runWrite = useRef(createRoutineWriteGuard()).current;
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const stored = await AsyncStorage.getItem(KEY);
      const next = stored ? parsePlaylists(stored) : [];
      current.current = next;
      setPlaylists(next);
    } catch {
      setError('Your playlists could not load. Retry before making changes.');
    } finally {
      setLoading(false);
    }
  }, [AsyncStorage]);
  useEffect(() => { void reload(); }, [reload]);
  const savePlaylist = useCallback((
    title: string,
    routineIds: string[],
    id?: string,
    skillIds?: string[],
    rateSkillsAtPlaylistEnd?: boolean,
    reminderSettings?: RoutineNotificationSettings,
  ) =>
    runWrite(async () => {
      if (loading || error) throw new Error('Wait for playlists to load successfully before saving.');
      validatePlaylist(title, routineIds);
      if (id && !current.current.some(item => item.id === id)) throw new Error('Playlist not found.');
      const previous = id ? current.current.find(item => item.id === id) : undefined;
      const playlist: RoutinePlaylist = {
        id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: title.trim(), routineIds: [...routineIds],
        ...((skillIds ?? previous?.skillIds)?.length ? { skillIds: [...(skillIds ?? previous!.skillIds!)] } : {}),
        rateSkillsAtPlaylistEnd: rateSkillsAtPlaylistEnd ?? previous?.rateSkillsAtPlaylistEnd ?? true,
        reminderSettings: {
          stepCompletion: reminderSettings?.stepCompletion
            ?? previous?.reminderSettings?.stepCompletion
            ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.stepCompletion,
          routineCompletion: reminderSettings?.routineCompletion
            ?? previous?.reminderSettings?.routineCompletion
            ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.routineCompletion,
        },
      };
      const next = id ? current.current.map(item => item.id === id ? playlist : item)
        : [...current.current, playlist];
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setPlaylists(next);
      return playlist;
    }), [error, loading, runWrite, AsyncStorage]);
  const mergeImportedPlaylists = useCallback((incoming: RoutinePlaylist[]) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for playlists to load successfully before importing.');
    const result = mergePlaylistCatalog(current.current, incoming);
    if (result.added || result.updated) {
      await AsyncStorage.setItem(KEY, JSON.stringify(result.playlists));
      current.current = result.playlists;
      setPlaylists(result.playlists);
    }
    return { added: result.added, skipped: result.skipped, renamed: result.renamed, updated: result.updated,
      idMap: result.idMap };
  }), [error, loading, runWrite, AsyncStorage]);
  const deletePlaylist = useCallback((id: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for playlists to load successfully before deleting.');
    const next = current.current.filter(item => item.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setPlaylists(next);
  }), [error, loading, runWrite, AsyncStorage]);
  const removeSkillAssignments = useCallback((skillId: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for playlists to load before deleting this skill.');
    const next = current.current.map(item => {
      if (!item.skillIds?.includes(skillId)) return item;
      const skillIds = item.skillIds.filter(id => id !== skillId);
      return { ...item, ...(skillIds.length ? { skillIds } : { skillIds: undefined }) };
    });
    if (next.every((item, index) => item === current.current[index])) return;
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setPlaylists(next);
  }), [error, loading, runWrite, AsyncStorage]);
  return <PlaylistContext.Provider value={{ playlists, loading, error, reload, savePlaylist, mergeImportedPlaylists,
    deletePlaylist, removeSkillAssignments }}>
    {children}
  </PlaylistContext.Provider>;
}

export function usePlaylists() {
  const context = useContext(PlaylistContext);
  if (!context) throw new Error('usePlaylists must be used within PlaylistProvider');
  return context;
}