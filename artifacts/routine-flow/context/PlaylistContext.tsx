import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { parsePlaylists, validatePlaylist, type RoutinePlaylist } from '@/lib/playlists';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';

const KEY = '@routine-flow/playlists';
type PlaylistContextValue = {
  playlists: RoutinePlaylist[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  savePlaylist: (title: string, routineIds: string[], id?: string) => Promise<RoutinePlaylist>;
  deletePlaylist: (id: string) => Promise<void>;
};
const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
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
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const savePlaylist = useCallback((title: string, routineIds: string[], id?: string) =>
    runWrite(async () => {
      if (loading || error) throw new Error('Wait for playlists to load successfully before saving.');
      validatePlaylist(title, routineIds);
      if (id && !current.current.some(item => item.id === id)) throw new Error('Playlist not found.');
      const playlist: RoutinePlaylist = {
        id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: title.trim(), routineIds: [...routineIds],
      };
      const next = id ? current.current.map(item => item.id === id ? playlist : item)
        : [...current.current, playlist];
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setPlaylists(next);
      return playlist;
    }), [error, loading, runWrite]);
  const deletePlaylist = useCallback((id: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for playlists to load successfully before deleting.');
    const next = current.current.filter(item => item.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setPlaylists(next);
  }), [error, loading, runWrite]);
  return <PlaylistContext.Provider value={{ playlists, loading, error, reload, savePlaylist, deletePlaylist }}>
    {children}
  </PlaylistContext.Provider>;
}

export function usePlaylists() {
  const context = useContext(PlaylistContext);
  if (!context) throw new Error('usePlaylists must be used within PlaylistProvider');
  return context;
}