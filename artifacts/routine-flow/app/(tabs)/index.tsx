import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import type { Routine } from '@/types/routines';

function formatDate() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { routines, loading, getCompletedCount, resetToday } = useRoutines();
  const totalSteps = routines.reduce((sum, routine) => sum + routine.steps.length, 0);
  const completedSteps = routines.reduce((sum, routine) => sum + getCompletedCount(routine), 0);
  const progress = totalSteps ? completedSteps / totalSteps : 0;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = formatDate();

  function openRoutine(routine: Routine) {
    void Haptics.selectionAsync();
    router.push({ pathname: '/routine/[id]', params: { id: routine.id } });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 30,
          paddingHorizontal: 20,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={[styles.date, { color: colors.mutedForeground }]}>{todayLabel}</Text>
                <Text style={[styles.greeting, { color: colors.foreground }]}>{greeting}, friend</Text>
              </View>
              <View style={[styles.avatar, { backgroundColor: colors.coralSoft }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>RF</Text>
              </View>
            </View>

            <View style={[styles.todayCard, { backgroundColor: colors.hero }]}>
              <View style={styles.todayCopy}>
                <View style={[styles.overlinePill, { backgroundColor: colors.accent }]}>
                  <Ionicons name="sparkles" size={12} color={colors.accentForeground} />
                  <Text style={[styles.overlineText, { color: colors.accentForeground }]}>TODAY’S FLOW</Text>
                </View>
                <Text style={[styles.todayTitle, { color: colors.heroForeground }]}>
                  Small steps,{"\n"}steady days.
                </Text>
                <Text style={[styles.todaySubtitle, { color: colors.heroForeground }]}>
                  {completedSteps === 0 ? 'Choose a routine and get started.' : `${completedSteps} steps complete today.`}
                </Text>
              </View>
              <View style={[styles.progressCircle, { borderColor: colors.sage }]}>
                <Text style={[styles.progressValue, { color: colors.heroForeground }]}>{Math.round(progress * 100)}%</Text>
                <Text style={[styles.progressLabel, { color: colors.heroForeground }]}>done</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your routines</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Keep the good things close</Text>
              </View>
              <Pressable
                accessibilityLabel="Create new routine"
                onPress={() => router.push('/new-routine')}
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add" size={21} color={colors.primaryForeground} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const completed = getCompletedCount(item);
          const itemProgress = item.steps.length ? completed / item.steps.length : 0;
          return (
            <Pressable
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => openRoutine(item)}
              style={({ pressed }) => [styles.routineCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
            >
              <View style={[styles.routineIcon, { backgroundColor: item.tone === 'coral' ? colors.coralSoft : item.tone === 'sage' ? colors.sageSoft : item.tone === 'lavender' ? colors.lavenderSoft : colors.secondary }]}>
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={item.tone === 'coral' ? colors.primary : item.tone === 'sage' ? colors.success : colors.inkSoft}
                />
              </View>
              <View style={styles.routineCopy}>
                <View style={styles.routineTitleRow}>
                  <Text style={[styles.routineTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                  <Feather name="arrow-up-right" size={17} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.routineSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
                <View style={styles.routineBottom}>
                  <Text style={[styles.routineMeta, { color: colors.inkSoft }]}>{item.steps.length} steps</Text>
                  <View style={[styles.miniTrack, { backgroundColor: colors.secondary }]}>
                    <View style={[styles.miniFill, { backgroundColor: colors.primary, width: `${itemProgress * 100}%` }]} />
                  </View>
                  <Text style={[styles.routineMeta, { color: colors.mutedForeground }]}>{completed}/{item.steps.length}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="leaf-outline" size={32} color={colors.sage} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your library is ready</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Create a routine to give your day a little shape.</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable
              accessibilityLabel="Reset today's progress"
              onPress={() => {
                void resetToday();
                void Haptics.selectionAsync();
              }}
              style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Reset today</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  date: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.3, marginBottom: 7 },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.7 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.5 },
  todayCard: { minHeight: 204, borderRadius: 25, padding: 21, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden', marginBottom: 31 },
  todayCopy: { flex: 1, paddingRight: 10 },
  overlinePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 20 },
  overlineText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  todayTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.5 },
  todaySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, opacity: 0.68, marginTop: 13, maxWidth: 170 },
  progressCircle: { width: 86, height: 86, borderRadius: 43, borderWidth: 7, alignItems: 'center', justifyContent: 'center', marginTop: 34 },
  progressValue: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, opacity: 0.65, marginTop: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 5 },
  addButton: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  routineCard: { minHeight: 98, borderRadius: 19, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  routineIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  routineCopy: { flex: 1, minWidth: 0 },
  routineTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routineTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  routineSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  routineBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 13 },
  routineMeta: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  miniTrack: { height: 5, borderRadius: 3, flex: 1, marginHorizontal: 9, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 3 },
  empty: { borderWidth: 1, borderRadius: 19, padding: 25, alignItems: 'center', marginBottom: 10 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 11 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  loading: { paddingVertical: 12 },
  footer: { alignItems: 'center', paddingTop: 19 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  resetText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  pressed: { opacity: 0.72 },
});