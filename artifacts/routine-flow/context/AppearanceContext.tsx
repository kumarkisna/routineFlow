import { usePersonStorage } from '@/context/PeopleContext';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import { Image, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  applyThemeCustomization,
  defaultThemeCustomization,
  findAppTheme,
  parseThemeCustomizationStore,
  saveThemeCustomizationStore,
  saveThemePreference,
  type AppTheme,
  type ThemeCustomization,
  type ThemeCustomizationStore,
} from '@/lib/appThemes';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import { PERSON_DATA_KEYS, PersonBackgroundStateUncertainError, persistPersonBackgroundImage } from '@/lib/personStorage';

const KEY = '@routine-flow/appearance';
type AppearanceContextValue = {
  theme: AppTheme;
  loading: boolean;
  saving: boolean;
  error: string;
  selectTheme: (id: string) => Promise<void>;
  customization: ThemeCustomization;
  previewCustomization: (value: ThemeCustomization) => void;
  saveCustomization: (value: ThemeCustomization) => Promise<void>;
  resetTheme: () => Promise<void>;
  backgroundImage: string | null;
  setBackgroundImage: (image: string | null) => Promise<void>;
};
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const AsyncStorage = usePersonStorage();
  const [theme, setTheme] = useState<AppTheme>(APP_THEMES[0]);
  const [customization, setCustomization] = useState<ThemeCustomization>(defaultThemeCustomization(APP_THEMES[0]));
  const [customizations, setCustomizations] = useState<ThemeCustomizationStore>({});
  const customizationsRef = useRef<ThemeCustomizationStore>({});
  const selectedThemeId = useRef(DEFAULT_THEME_ID);
  const [backgroundImage, setBackgroundImageState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const runWrite = useRef(createRoutineWriteGuard()).current;
  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(KEY),
      AsyncStorage.getItem(PERSON_DATA_KEYS.backgroundImage),
      AsyncStorage.getItem(PERSON_DATA_KEYS.appearanceCustomization),
    ]).then(([id, image, rawCustomizations]) => {
      const saved = findAppTheme(id ?? DEFAULT_THEME_ID);
      if (!saved) throw new Error('Unknown saved theme');
      const savedCustomizations = parseThemeCustomizationStore(rawCustomizations);
      const savedCustomization = savedCustomizations[saved.id] ?? defaultThemeCustomization(saved);
      if (active) {
        selectedThemeId.current = saved.id;
        customizationsRef.current = savedCustomizations;
        setCustomizations(savedCustomizations);
        setCustomization(savedCustomization);
        setTheme(savedCustomizations[saved.id] ? applyThemeCustomization(saved, savedCustomization) : saved);
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
    const baseTheme = findAppTheme(id);
    if (!baseTheme) throw new Error('Theme not found.');
    setSaving(true);
    setError('');
    try {
      await saveThemePreference(AsyncStorage, KEY, id);
      const storedCustomization = customizationsRef.current[id];
      const nextCustomization = storedCustomization ?? defaultThemeCustomization(baseTheme);
      selectedThemeId.current = id;
      setCustomization(nextCustomization);
      setTheme(storedCustomization ? applyThemeCustomization(baseTheme, nextCustomization) : baseTheme);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Your appearance could not be saved. Please try again.';
      setError(message);
      throw new Error(message);
    } finally { setSaving(false); }
  }), [loading, runWrite, AsyncStorage]);
  const previewCustomization = useCallback((value: ThemeCustomization) => {
    const baseTheme = findAppTheme(selectedThemeId.current);
    if (!baseTheme) return;
    setCustomization(value);
    setTheme(applyThemeCustomization(baseTheme, value));
  }, []);
  const saveCustomization = useCallback((value: ThemeCustomization) => runWrite(async () => {
    if (loading) throw new Error('Wait for your appearance settings to load.');
    const id = selectedThemeId.current;
    const baseTheme = findAppTheme(id);
    if (!baseTheme) throw new Error('Theme not found.');
    const previous = customizationsRef.current;
    const next = { ...previous, [id]: value };
    const nextTheme = applyThemeCustomization(baseTheme, value);
    setTheme(nextTheme);
    setCustomization(value);
    setSaving(true);
    setError('');
    try {
      await saveThemeCustomizationStore(AsyncStorage, PERSON_DATA_KEYS.appearanceCustomization, next);
      customizationsRef.current = next;
      setCustomizations(next);
    } catch (e) {
      const previousValue = previous[id] ?? defaultThemeCustomization(baseTheme);
      setCustomization(previousValue);
      setTheme(previous[id] ? applyThemeCustomization(baseTheme, previousValue) : baseTheme);
      const message = e instanceof Error ? e.message : 'Your custom colors could not be saved.';
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }), [loading, runWrite, AsyncStorage]);
  const resetTheme = useCallback(() => runWrite(async () => {
    if (loading) throw new Error('Wait for your appearance settings to load.');
    const defaultTheme = findAppTheme(DEFAULT_THEME_ID)!;
    const previousId = await AsyncStorage.getItem(KEY);
    const previousCustomizations = await AsyncStorage.getItem(PERSON_DATA_KEYS.appearanceCustomization);
    setSaving(true);
    setError('');
    try {
      await saveThemeCustomizationStore(AsyncStorage, PERSON_DATA_KEYS.appearanceCustomization, {});
      await saveThemePreference(AsyncStorage, KEY, DEFAULT_THEME_ID);
      selectedThemeId.current = DEFAULT_THEME_ID;
      customizationsRef.current = {};
      setCustomizations({});
      setCustomization(defaultThemeCustomization(defaultTheme));
      setTheme(defaultTheme);
    } catch (e) {
      try {
        if (previousCustomizations === null) await AsyncStorage.removeItem(PERSON_DATA_KEYS.appearanceCustomization);
        else await AsyncStorage.setItem(PERSON_DATA_KEYS.appearanceCustomization, previousCustomizations);
        if (previousId) await AsyncStorage.setItem(KEY, previousId);
      } catch { /* Keep the previous palette visible and report the failed reset. */ }
      const message = e instanceof Error ? e.message : 'Your appearance could not be reset.';
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }), [loading, runWrite, AsyncStorage]);
  const saveBackgroundImage = useCallback(async (image: string | null) => {
    if (loading) throw new Error('Wait for your appearance settings to load.');
    try {
      await persistPersonBackgroundImage(AsyncStorage, image);
    } catch (error) {
      if (error instanceof PersonBackgroundStateUncertainError) setBackgroundImageState(null);
      throw error;
    }
    setBackgroundImageState(image);
  }, [loading, AsyncStorage]);
  return <AppearanceContext.Provider value={{
    theme, loading, saving, error, selectTheme, customization, previewCustomization,
    saveCustomization, resetTheme, backgroundImage, setBackgroundImage: saveBackgroundImage,
  }}>
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