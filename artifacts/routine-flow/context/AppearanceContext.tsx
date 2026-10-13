import { usePersonStorage } from '@/context/PeopleContext';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import { Image, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { APP_THEMES, DEFAULT_THEME_ID, findAppTheme, saveThemePreference, type AppTheme } from '@/lib/appThemes';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import { PERSON_DATA_KEYS, persistPersonBackgroundImage } from '@/lib/personStorage';

const KEY = '@routine-flow/appearance';
type AppearanceContextValue = {
  theme: AppTheme;
  loading: boolean;
  saving: boolean;
  error: string;
  selectTheme: (id: string) => Promise<void>;
  backgroundImage: string | null;
  setBackgroundImage: (image: string | null) => Promise<void>;
};
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const AsyncStorage = usePersonStorage();
  const [theme, setTheme] = useState<AppTheme>(APP_THEMES[0]);
  const [backgroundImage, setBackgroundImageState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const runWrite = useRef(createRoutineWriteGuard()).current;
  useEffect(() => {
    let active = true;
    void Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(PERSON_DATA_KEYS.backgroundImage)]).then(([id, image]) => {
      const saved = findAppTheme(id ?? DEFAULT_THEME_ID);
      if (!saved) throw new Error('Unknown saved theme');
      if (active) {
        setTheme(saved);
        setBackgroundImageState(image);
      }
    }).catch(() => {
      if (active) setError('Your saved appearance could not load. Choose a theme to save a new preference.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [AsyncStorage]);
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
  }), [loading, runWrite, AsyncStorage]);
  const saveBackgroundImage = useCallback(async (image: string | null) => {
    if (loading) throw new Error('Wait for your appearance settings to load.');
    await persistPersonBackgroundImage(AsyncStorage, image);
    setBackgroundImageState(image);
  }, [loading, AsyncStorage]);
  return <AppearanceContext.Provider value={{ theme, loading, saving, error, selectTheme, backgroundImage, setBackgroundImage: saveBackgroundImage }}>
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {backgroundImage ? <Image testID="app-background-image" accessibilityLabel="Custom app background photo" source={{ uri: backgroundImage }} resizeMode="cover"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.22 }} /> : null}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </View>
  </AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used within AppearanceProvider');
  return context;
}