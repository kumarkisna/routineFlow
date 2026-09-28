import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import { formatHistoryDay, getHistoryForDay, localDayKey, recordedPastDays } from '@/lib/progressHistory';

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { progress, routines, loading } = useRoutines();
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const today = localDayKey(new Date());
  const days = recordedPastDays(progress, today);
  // If a restore adds a more recent day, keep the user's current selection.
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : days[0];
  const activeIndex = days.indexOf(activeDay);
  const groups = activeDay ? getHistoryForDay(progress, routines, activeDay) : [];
  const total = groups.reduce((sum, group) => sum + group.steps.length, 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 110 : insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>YOUR JOURNEY</Text>
      <Text style={[styles.heading, { color: colors.foreground }]}>Past days</Text>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        A look at the steps you completed on earlier days.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : activeDay ? (
        <>
          <View style={[styles.dayCard, { backgroundColor: colors.hero }]}>
            <Text style={[styles.dayOverline, { color: colors.accent }]}>RECORDED PROGRESS</Text>
            <Text style={[styles.dayTitle, { color: colors.heroForeground }]}>{formatHistoryDay(activeDay)}</Text>
            <Text style={[styles.dayCount, { color: colors.heroForeground }]}>
              {total} {total === 1 ? 'step' : 'steps'} completed
            </Text>
            <View style={styles.dayNavigation}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Older recorded day"
                accessibilityState={{ disabled: activeIndex === days.length - 1 }}
                testID="history-older-day"
                disabled={activeIndex === days.length - 1}
                onPress={() => setSelectedDay(days[activeIndex + 1])}
                style={({ pressed }) => [styles.dayButton, { borderColor: colors.sage }, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={17} color={colors.heroForeground} />
                <Text style={[styles.dayButtonText, { color: colors.heroForeground }]}>Older</Text>
              </Pressable>
              <Text style={[styles.dayPosition, { color: colors.heroForeground }]}>{activeIndex + 1} of {days.length}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Newer recorded day"
                accessibilityState={{ disabled: activeIndex === 0 }}
                testID="history-newer-day"
                disabled={activeIndex === 0}
                onPress={() => setSelectedDay(days[activeIndex - 1])}
                style={({ pressed }) => [styles.dayButton, { borderColor: colors.sage }, pressed && styles.pressed]}
              >
                <Text style={[styles.dayButtonText, { color: colors.heroForeground }]}>Newer</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.heroForeground} />
              </Pressable>
            </View>
          </View>

          {groups.map((group) => (
            <View key={group.id} style={[styles.routineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.routineHeader}>
                <View style={[styles.routineIcon, { backgroundColor: colors.sageSoft }]}>
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.success} />
                </View>
                <View style={styles.routineHeading}>
                  <Text style={[styles.routineTitle, { color: colors.foreground }]}>{group.title}</Text>
                  <Text style={[styles.routineMeta, { color: colors.mutedForeground }]}>
                    {group.steps.length} completed · {group.removed ? 'No longer in your routines' : group.hidden ? 'Currently hidden' : 'Routine'}
                  </Text>
                </View>
              </View>
              {group.steps.map((step) => (
                <View key={step.id} style={[styles.stepRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="checkmark-circle" size={19} color={colors.success} />
                  <View style={styles.stepCopy}>
                    <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                    {step.hidden && !step.removed ? (
                      <Text style={[styles.stepNote, { color: colors.mutedForeground }]}>Currently hidden</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="calendar-outline" size={32} color={colors.sage} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No past progress yet</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            Completed steps from earlier days, including restored progress, will show up here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1, marginBottom: 9 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.7 },
  intro: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 24 },
  loading: { marginTop: 32 },
  dayCard: { borderRadius: 25, padding: 21, marginBottom: 20 },
  dayOverline: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9 },
  dayTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 13 },
  dayCount: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6, opacity: 0.8 },
  dayNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  dayButton: { minWidth: 86, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderRadius: 12 },
  dayButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  dayPosition: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  pressed: { opacity: 0.65 },
  routineCard: { borderWidth: 1, borderRadius: 19, padding: 17, marginBottom: 11 },
  routineHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 },
  routineIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  routineHeading: { flex: 1 },
  routineTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  routineMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1 },
  stepCopy: { flex: 1 },
  stepTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  stepNote: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  empty: { borderWidth: 1, borderRadius: 19, padding: 25, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 12 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});