import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { APP_THEMES, DEFAULT_THEME_ID, findAppTheme, saveThemePreference, type AppTheme } from '@/lib/appThemes';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';

const KEY = '@routine-flow/appearance';
type AppearanceContextValue = {
  theme: AppTheme;
  loading: boolean;
  saving: boolean;
  error: string;
  selectTheme: (id: string) => Promise<void>;
};
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(APP_THEMES[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const runWrite = useRef(createRoutineWriteGuard()).current;
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(KEY).then(id => {
      const saved = findAppTheme(id ?? DEFAULT_THEME_ID);
      if (!saved) throw new Error('Unknown saved theme');
      if (active) setTheme(saved);
    }).catch(() => {
      if (active) setError('Your saved appearance could not load. Choose a theme to save a new preference.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Appearance.setColorScheme(theme.scheme);
    void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(error => {
      console.warn('Could not update the system background for the selected theme.', error);
    });
  }, [theme]);
  useEffect(() => () => {
    if (Platform.OS !== 'web') Appearance.setColorScheme('unspecified');
  }, []);
  const selectTheme = useCallback((id: string) => runWrite(async () => {
    if (loading) throw new Error('Wait for your appearance settings to load.');
    const next = findAppTheme(id);
    if (!next) throw new Error('Theme not found.');
    setSaving(true);
    setError('');
    try {
      setTheme(await saveThemePreference(AsyncStorage, KEY, id));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Your appearance could not be saved. Please try again.';
      setError(message);
      throw new Error(message);
    } finally { setSaving(false); }
  }), [loading, runWrite]);
  return <AppearanceContext.Provider value={{ theme, loading, saving, error, selectTheme }}>
    <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    {children}
  </AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used within AppearanceProvider');
  return context;
}