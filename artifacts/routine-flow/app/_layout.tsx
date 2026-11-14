import { PlaylistProvider } from '@/context/PlaylistContext';
import { ScheduleProvider } from '@/context/ScheduleContext';
import { SkillProvider, useSkills } from '@/context/SkillContext';
import { AppearanceProvider } from '@/context/AppearanceContext';
import { ScheduleNotificationLink } from '@/components/ScheduleNotificationLink';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useColors } from '@/hooks/useColors';
import { PeopleProvider, usePeople } from '@/context/PeopleContext';
import { useAppearance } from '@/context/AppearanceContext';
import { useRoutines } from '@/context/RoutineContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useSchedules } from '@/context/ScheduleContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { RoutineProvider } from '@/context/RoutineContext';
import { APP_NAME } from '@/constants/brand';

const GestureHandlerRoot = GestureHandlerRootView as unknown as React.ComponentType<{
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}>;

// Keep the splash only until our own visible startup screen has laid out.
void SplashScreen.preventAutoHideAsync().catch(() => {
  console.warn('The native splash screen could not be held during startup.');
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  return <>
    <Stack screenOptions={{ headerShown: false }} />
    <ScheduleNotificationLink />
  </>;
}

function PersonReadyNav({ startupDelayElapsed }: { startupDelayElapsed: boolean }) {
  const appearance = useAppearance();
  const routines = useRoutines();
  const playlists = usePlaylists();
  const schedules = useSchedules();
  const skills = useSkills();
  if (!startupDelayElapsed || appearance.loading || routines.loading || playlists.loading || schedules.loading || skills.loading) {
    return <StartupLoading detail="Loading saved routines and settings" />;
  }
  return <RootLayoutNav />;
}

function StartupLoading({ detail = 'Loading fonts' }: { detail?: string }) {
  const colors = useColors();
  return (
    <View testID="app-startup-loading" style={[styles.startup, { backgroundColor: colors.background }]}>
      <Image
        testID="app-startup-logo"
        accessibilityLabel={`${APP_NAME} logo`}
        source={require('../assets/images/icon.png')}
        resizeMode="contain"
        style={styles.startupLogo}
      />
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.startupTitle, { color: colors.foreground }]}>{APP_NAME}</Text>
      <Text testID="app-startup-copyright" style={[styles.startupCopyright, { color: colors.mutedForeground }]}>
        Copyright Shreshth Bharat Tennis Trust - 2026 - Present
      </Text>
      <Text style={[styles.startupDetail, { color: colors.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

function FontLoadingNotice({ failed }: { failed: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fontNotice, { bottom: insets.bottom + 90, backgroundColor: colors.card, pointerEvents: 'none' }]}>
      <Text testID="app-font-notice" accessibilityRole="alert" style={{ color: colors.foreground, fontSize: 12 }}>
        {failed ? 'Custom fonts could not load. Using device fonts.' : 'Custom fonts are still loading. Using device fonts for now.'}
      </Text>
    </View>
  );
}

function PersonNotice() {
  const { notice } = usePeople();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (!notice) return null;
  return <View style={[styles.fontNotice, { bottom: insets.bottom + 150, backgroundColor: colors.card, pointerEvents: 'none' }]}>
    <Text testID="person-notice" accessibilityRole="alert" style={{ color: colors.foreground, fontSize: 13 }}>{notice}</Text>
  </View>;
}

function PersonApp({ waitingForFonts, startupDelayElapsed, fontsLoaded, fontFailed }: {
  waitingForFonts: boolean;
  startupDelayElapsed: boolean;
  fontsLoaded: boolean;
  fontFailed: boolean;
}) {
  const { activePerson, revision } = usePeople();
  // The person key remounts all person-scoped data providers below on profile changes.
  return (
    <AppearanceProvider key={`${activePerson.id}:${revision}`}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRoot style={{ flex: 1 }}>
            {waitingForFonts ? <StartupLoading /> : <>
              <KeyboardProvider>
                <RoutineProvider>
                  <PlaylistProvider>
                    <ScheduleProvider>
                      <SkillProvider>
                <PersonReadyNav startupDelayElapsed={startupDelayElapsed} />
                      </SkillProvider>
                    </ScheduleProvider>
                  </PlaylistProvider>
                </RoutineProvider>
              </KeyboardProvider>
              {!fontsLoaded ? <FontLoadingNotice failed={fontFailed} /> : null}
              <PersonNotice />
            </>}
          </GestureHandlerRoot>
        </QueryClientProvider>
      </ErrorBoundary>
    </AppearanceProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontWaitExpired, setFontWaitExpired] = useState(false);
  const [startupDelayElapsed, setStartupDelayElapsed] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontWaitExpired(true), 8000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const timer = setTimeout(() => setStartupDelayElapsed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {
      console.warn('The native splash screen could not be dismissed.');
    });
  }, []);
  const waitingForFonts = !fontsLoaded && !fontError && !fontWaitExpired;

  return (
    <SafeAreaProvider onLayout={hideSplash}>
      <PeopleProvider>
        <PersonApp
          waitingForFonts={waitingForFonts}
          startupDelayElapsed={startupDelayElapsed}
          fontsLoaded={fontsLoaded}
          fontFailed={!!fontError}
        />
      </PeopleProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  startup: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  startupLogo: { width: 72, height: 72, borderRadius: 16 },
  startupTitle: { fontSize: 18, fontWeight: '600' },
  startupCopyright: { fontSize: 11 },
  startupDetail: { fontSize: 14 },
  fontNotice: { position: 'absolute', left: 20, right: 20, borderRadius: 12, padding: 12 },
});
