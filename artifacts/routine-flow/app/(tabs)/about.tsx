import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '@/constants/brand';
import { useColors } from '@/hooks/useColors';

const guideSections = [
  {
    id: 'today',
    title: 'Today and routines',
    icon: 'home-outline' as const,
    steps: [
      'The Today tab is your starting point. Choose a routine card to open it, or use the add button to make a new routine.',
      'Use categories to group routines. Reorder, hide, rename, or remove categories and routines from Today.',
      'Open a routine to edit its steps, timers, details, skills, and spoken instructions.',
    ],
  },
  {
    id: 'create',
    title: 'Create a routine',
    icon: 'create-outline' as const,
    steps: [
      'Give the routine a clear name and add steps in the order you want to follow them.',
      'Set a duration for timed steps. Add step details or photos when they help explain what to do.',
      'Assign skills to a routine or individual steps. Hidden steps are skipped when the routine runs.',
      'Save your changes before leaving the editor.',
    ],
  },
  {
    id: 'run',
    title: 'Run and reflect',
    icon: 'play-circle-outline' as const,
    steps: [
      'Tap Start on a routine. Follow each step, use the timer controls, and move forward or back as needed.',
      'When a reflection template is set, it appears as the starting text after the run. Edit it for that run before saving.',
      'If skill ratings are enabled, rate the skills when prompted. Your ratings and reflection are saved with the run.',
    ],
  },
  {
    id: 'playlists',
    title: 'Use playlists',
    icon: 'list-outline' as const,
    steps: [
      'Open Playlists to combine routines into a sequence. Add routines, then arrange them in the order you want.',
      'Start a playlist to run its available routines in sequence. You can skip unavailable or hidden routines.',
      'Playlist skill ratings and completion reflections are collected with the playlist run.',
    ],
  },
  {
    id: 'skills',
    title: 'Skills and progress',
    icon: 'sparkles-outline' as const,
    steps: [
      'Use Skills to manage the skills you track and see where each skill is used.',
      'Ratings belong to the active person. Skill history and averages update as you save new ratings.',
      'Open History to review completed runs by date, routine, or playlist, and edit saved reflections.',
    ],
  },
  {
    id: 'schedule',
    title: 'Schedules',
    icon: 'calendar-outline' as const,
    steps: [
      'Open Schedule and choose New schedule to select a routine or playlist and its date and time.',
      'Set phone reminders and lead times when you want alerts. Tap Start on a schedule when you are ready to run it.',
      'Schedules are saved on this device and are not included in routine backups.',
    ],
  },
  {
    id: 'people',
    title: 'People and backups',
    icon: 'people-outline' as const,
    steps: [
      'Use the person control on Today to switch profiles or manage people. Each person has separate routines, schedules, ratings, and progress.',
      'Open the backup tools on Today to export or restore one person or all profiles. Imports merge data; review the confirmation before restoring.',
      'Appearance settings let you choose a theme. Themes are saved separately for each person.',
    ],
  },
] as const;

type GuideSectionId = (typeof guideSections)[number]['id'];

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef<ScrollView>(null);
  const sectionOffsets = React.useRef<Partial<Record<GuideSectionId, number>>>({});

  function jumpTo(sectionId: GuideSectionId) {
    const y = sectionOffsets.current[sectionId];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        testID="about-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 118 : insets.bottom + 112,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.header}>
          <View style={[styles.brandMark, { backgroundColor: colors.coralSoft }]}>
            <Ionicons name="tennisball-outline" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>About {APP_NAME}</Text>
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>
            Build routines, follow them step by step, and keep a record of your progress.
          </Text>
          <Text testID="about-copyright" style={[styles.copyright, { color: colors.inkSoft }]}>
            Copyright Shreshth Bharat Tennis Trust - 2026 - Present
          </Text>
        </View>

        <View style={[styles.guideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.guideTitle, { color: colors.foreground }]}>How to use the app</Text>
          <Text style={[styles.guideIntro, { color: colors.mutedForeground }]}>
            Choose a topic to jump to its instructions.
          </Text>
          <View style={styles.topicList}>
            {guideSections.map((section) => (
              <Pressable
                key={section.id}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${section.title} instructions`}
                testID={`about-jump-${section.id}`}
                onPress={() => jumpTo(section.id)}
                style={({ pressed }) => [
                  styles.topicButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.topicText, { color: colors.foreground }]}>{section.title}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </View>

        {guideSections.map((section) => (
          <View
            key={section.id}
            onLayout={(event) => { sectionOffsets.current[section.id] = event.nativeEvent.layout.y; }}
            style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.sectionHeading}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.coralSoft }]}>
                <Ionicons name={section.icon} size={19} color={colors.primary} />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
            </View>
            {section.steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <Text style={[styles.stepNumber, { color: colors.primary }]}>{index + 1}</Text>
                <Text style={[styles.stepText, { color: colors.inkSoft }]}>{step}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },
  brandMark: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  intro: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  copyright: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
  guideCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  guideTitle: { fontSize: 19, lineHeight: 25, fontWeight: '700' },
  guideIntro: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  topicList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  topicButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topicText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sectionCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  stepNumber: { width: 21, height: 21, borderRadius: 11, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, lineHeight: 21, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },
  pressed: { opacity: 0.7 },
});
