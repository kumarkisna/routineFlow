import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Speech from 'expo-speech';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkillRatingPrompt, type SkillRatingNoteEditTarget } from '@/components/SkillRatingPrompt';
import { usePeople } from '@/context/PeopleContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSkills } from '@/context/SkillContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useColors } from '@/hooks/useColors';
import { usePersistentDisclosure } from '@/hooks/usePersistentDisclosure';
import { useSpeechVoice } from '@/hooks/useSpeechVoice';
import {
  createHistorySkillRatingRun, formatHistoryDay, getHistoryForDay, getSkillRatingsMissingNotes, getUnratedSkillIds,
  groupSkillRatingEvents, localDayKey, playlistHistoryOptions, playlistHistoryRatingAnchorId,
  recordedHistoryDays, routineHistoryOptions, type HistoryFilter, type SkillRatingEvent,
} from '@/lib/progressHistory';
import { buildSkillRatingReportHtml, formatSkillRatingDateTime } from '@/lib/skillRatingReport';
import { buildSkillRatingSpeechText } from '@/lib/skillRatingSpeech';
import { getPlaylistSkillIds, getRoutineSkillIds, type SkillRatingRun } from '@/lib/skills';
import { playablePlaylistIds } from '@/lib/playlists';

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activePerson } = usePeople();
  const speechVoiceId = useSpeechVoice(activePerson.speechVoiceId);
  const disclosure = usePersistentDisclosure('history', activePerson.id);
  const { progress, routines, loading } = useRoutines();
  const { skills, loading: skillsLoading, error: skillsError } = useSkills();
  const { playlists, loading: playlistsLoading, error: playlistsError } = usePlaylists();
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [filterKind, setFilterKind] = React.useState<'all' | 'routine' | 'playlist'>('all');
  const [selectedRoutineId, setSelectedRoutineId] = React.useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = React.useState('');
  const [exportingRunId, setExportingRunId] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<{ runId: string; message: string } | null>(null);
  const [speakingEventKey, setSpeakingEventKey] = React.useState<string | null>(null);
  const [speechError, setSpeechError] = React.useState<{ eventKey: string; message: string } | null>(null);
  const [ratingPrompt, setRatingPrompt] = React.useState<{
    mode: 'ratings' | 'notes';
    skillIds: string[];
    routineTitle: string;
    contextLabel: string;
    run?: SkillRatingRun;
    noteTargets?: ReturnType<typeof getSkillRatingsMissingNotes>;
  } | null>(null);
  const [reflectionEditTarget, setReflectionEditTarget] = React.useState<SkillRatingNoteEditTarget | null>(null);
  const exportLock = React.useRef(false);
  const speechSessionRef = React.useRef(0);
  const speechEventKeyRef = React.useRef<string | null>(null);
  const today = localDayKey(new Date());
  const routineOptions = routineHistoryOptions(progress, routines);
  const playlistOptions = playlistHistoryOptions(progress, playlists);
  const selectedRoutine = routineOptions.find(item => item.id === selectedRoutineId) ?? routineOptions[0];
  const selectedPlaylist = playlistOptions.find(item => item.id === selectedPlaylistId) ?? playlistOptions[0];
  const activeFilter: HistoryFilter | undefined = filterKind === 'routine' && selectedRoutine
    ? { kind: 'routine', id: selectedRoutine.id }
    : filterKind === 'playlist' && selectedPlaylist
      ? { kind: 'playlist', id: selectedPlaylist.id }
      : undefined;
  const days = filterKind === 'all' || activeFilter ? recordedHistoryDays(progress, today, activeFilter) : [];
  // If a restore adds a more recent day, keep the user's current selection.
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : days[0];
  const activeIndex = days.indexOf(activeDay);
  const groups = activeDay ? getHistoryForDay(progress, routines, activeDay, skills, activeFilter) : [];
  const selectedPlaylistData = playlists.find(item => item.id === selectedPlaylist?.id);
  const playlistRunGroups = activeFilter?.kind === 'playlist'
    ? groups.filter(group => group.playlistRuns?.some(run => run.playlistId === activeFilter.id))
    : [];
  const playlistRatingAnchorId = activeFilter?.kind === 'playlist'
    ? playlistHistoryRatingAnchorId(groups, activeFilter.id, selectedPlaylistData?.routineIds)
    : null;
  const playlistRatingSkillIds = selectedPlaylistData
    ? getPlaylistSkillIds(
      playablePlaylistIds(selectedPlaylistData.routineIds, routines),
      routines,
      selectedPlaylistData.skillIds,
    )
    : playlistRunGroups.flatMap(group => {
      const routine = routines.find(item => item.id === group.id);
      return routine ? getRoutineSkillIds(routine) : [];
    });
  const playlistRatings = playlistRunGroups.flatMap(group => group.skillRatings ?? []);
  const total = groups.reduce((sum, group) => sum + group.steps.length, 0);
  const isLoading = loading || skillsLoading || playlistsLoading;

  const stopSkillSpeech = React.useCallback(() => {
    const stoppedEventKey = speechEventKeyRef.current;
    const session = ++speechSessionRef.current;
    speechEventKeyRef.current = null;
    setSpeakingEventKey(null);
    if (!stoppedEventKey) return;
    void Speech.stop().catch(() => {
      if (speechSessionRef.current === session) {
        setSpeechError({ eventKey: stoppedEventKey, message: 'Could not stop speech playback.' });
      }
    });
  }, []);

  useFocusEffect(React.useCallback(
    () => () => stopSkillSpeech(),
    [stopSkillSpeech],
  ));

  async function speakSkillRatings(routineTitle: string, event: SkillRatingEvent, eventKey: string) {
    if (speechEventKeyRef.current === eventKey) {
      stopSkillSpeech();
      return;
    }

    const session = ++speechSessionRef.current;
    speechEventKeyRef.current = eventKey;
    setSpeakingEventKey(eventKey);
    setSpeechError(null);
    try {
      const text = buildSkillRatingSpeechText(routineTitle, event);
      await Speech.stop();
      if (speechSessionRef.current !== session) return;
      Speech.speak(text, {
        rate: 0.95,
        voice: speechVoiceId,
        onDone: () => {
          if (speechSessionRef.current === session) {
            speechEventKeyRef.current = null;
            setSpeakingEventKey(null);
          }
        },
        onStopped: () => {
          if (speechSessionRef.current === session) {
            speechEventKeyRef.current = null;
            setSpeakingEventKey(null);
          }
        },
        onError: () => {
          if (speechSessionRef.current === session) {
            speechEventKeyRef.current = null;
            setSpeakingEventKey(null);
            setSpeechError({ eventKey, message: 'Could not speak these skill ratings.' });
          }
        },
      });
    } catch {
      if (speechSessionRef.current === session) {
        speechEventKeyRef.current = null;
        setSpeakingEventKey(null);
        setSpeechError({ eventKey, message: 'Could not speak these skill ratings.' });
      }
    }
  }

  function chooseFilter(kind: 'all' | 'routine' | 'playlist') {
    stopSkillSpeech();
    setFilterKind(kind);
    setSelectedDay(null);
    if (kind === 'routine' && routineOptions[0]) setSelectedRoutineId(routineOptions[0].id);
    if (kind === 'playlist' && playlistOptions[0]) setSelectedPlaylistId(playlistOptions[0].id);
  }

  async function exportSkillRatings(routineTitle: string, event: SkillRatingEvent) {
    if (exportLock.current) return;
    exportLock.current = true;
    setExportingRunId(event.id);
    setExportError(null);
    try {
      const html = buildSkillRatingReportHtml({
        personName: activePerson.name,
        personId: activePerson.id,
        routineTitle,
        dateTime: event.dateTime,
        isRunTime: event.isRunTime,
        ratings: event.ratings,
      });
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined') throw new Error('Browser printing is unavailable.');
        const printWindow = window.open('', '_blank');
        if (!printWindow) throw new Error('Allow pop-ups in your browser to save the PDF.');
        printWindow.onafterprint = () => printWindow.close();
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      } else if (Platform.OS === 'android') {
        // Android sharing may reject Expo Print's generated file URL; the
        // native print sheet supports both printing and saving the report.
        await Print.printAsync({ html });
      } else {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${routineTitle} skill ratings`,
          });
        } else {
          await Print.printAsync({ html });
        }
      }
    } catch (error) {
      setExportError({
        runId: event.id,
        message: error instanceof Error ? error.message : 'Could not create the skill ratings PDF.',
      });
    } finally {
      exportLock.current = false;
      setExportingRunId(null);
    }
  }

  function openHistoryRatingPrompt(
    routineTitle: string,
    skillIds: string[],
    ratings: ReturnType<typeof getHistoryForDay>[number]['skillRatings'],
    scope: 'routine' | 'playlist',
    sourceId: string,
    routineId: string,
    contextLabel: string,
  ) {
    if (!activeDay) return;
    const missingSkillIds = getUnratedSkillIds(skillIds, ratings ?? []);
    if (!missingSkillIds.length) return;
    setRatingPrompt({
      mode: 'ratings',
      skillIds: missingSkillIds,
      routineTitle,
      contextLabel,
      run: createHistorySkillRatingRun(activeDay, routineId, scope === 'playlist' ? sourceId : undefined),
    });
  }

  function openHistoryNotePrompt(
    routineTitle: string,
    noteTargets: ReturnType<typeof getSkillRatingsMissingNotes>,
    contextLabel: string,
  ) {
    if (!noteTargets.length) return;
    setRatingPrompt({
      mode: 'notes',
      skillIds: [...new Set(noteTargets.map(target => target.skillId))],
      routineTitle,
      contextLabel,
      noteTargets,
    });
  }

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
      <Text style={[styles.heading, { color: colors.foreground }]}>History</Text>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Browse completed routines, playlist runs, skill ratings, and notes.
      </Text>

      <View style={styles.filterBlock}>
        <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>SHOW HISTORY FOR</Text>
        <View style={styles.filterKinds}>
          {([
            ['all', 'All'],
            ['routine', 'Routines'],
            ['playlist', 'Playlists'],
          ] as const).map(([kind, label]) => {
            const selected = filterKind === kind;
            return (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`history-filter-${kind}`}
                onPress={() => chooseFilter(kind)}
                style={({ pressed }) => [
                  styles.filterKindButton,
                  { backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterKindText,
                  { color: selected ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {filterKind === 'routine' ? (
          routineOptions.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterItems} testID="history-routine-options">
              {routineOptions.map(item => {
                const selected = selectedRoutine?.id === item.id;
                return (
                  <Pressable key={item.id} accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.title}${item.archived ? ', removed routine history' : ''}`}
                    testID={`history-routine-${item.id}`}
                     onPress={() => { stopSkillSpeech(); setSelectedRoutineId(item.id); setSelectedDay(null); }}
                    style={({ pressed }) => [
                      styles.filterItemButton,
                      { backgroundColor: selected ? colors.sageSoft : colors.card,
                        borderColor: selected ? colors.sage : colors.border },
                      pressed && styles.pressed,
                    ]}>
                    <Text numberOfLines={1} style={[styles.filterItemText, { color: colors.foreground }]}>
                      {item.title}{item.archived ? ' · removed' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : <Text style={[styles.filterEmpty, { color: colors.mutedForeground }]}>No routines available to filter.</Text>
        ) : null}
        {filterKind === 'playlist' ? (
          playlistOptions.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterItems} testID="history-playlist-options">
              {playlistOptions.map(item => {
                const selected = selectedPlaylist?.id === item.id;
                return (
                  <Pressable key={item.id} accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.title}${item.archived ? ', removed playlist history' : ''}`}
                    testID={`history-playlist-${item.id}`}
                     onPress={() => { stopSkillSpeech(); setSelectedPlaylistId(item.id); setSelectedDay(null); }}
                    style={({ pressed }) => [
                      styles.filterItemButton,
                      { backgroundColor: selected ? colors.sageSoft : colors.card,
                        borderColor: selected ? colors.sage : colors.border },
                      pressed && styles.pressed,
                    ]}>
                    <Text numberOfLines={1} style={[styles.filterItemText, { color: colors.foreground }]}>
                      {item.title}{item.archived ? ' · removed' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : <Text style={[styles.filterEmpty, { color: colors.mutedForeground }]}>No playlists available to filter.</Text>
        ) : null}
      </View>

      {skillsError ? (
        <Text accessibilityRole="alert" style={[styles.skillHistoryError, { color: colors.destructive }]}>
          Skill ratings and notes could not load. Retry from the Skills page to view them here.
        </Text>
      ) : null}
      {playlistsError ? (
        <Text accessibilityRole="alert" style={[styles.skillHistoryError, { color: colors.destructive }]}>
          Playlists could not load. Retry from the Playlists page to use playlist filters.
        </Text>
      ) : null}

      {isLoading ? (
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
                onPress={() => { stopSkillSpeech(); setSelectedDay(days[activeIndex + 1]); }}
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
                onPress={() => { stopSkillSpeech(); setSelectedDay(days[activeIndex - 1]); }}
                style={({ pressed }) => [styles.dayButton, { borderColor: colors.sage }, pressed && styles.pressed]}
              >
                <Text style={[styles.dayButtonText, { color: colors.heroForeground }]}>Newer</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.heroForeground} />
              </Pressable>
            </View>
          </View>

          {groups.map((group) => {
            const routine = routines.find(item => item.id === group.id);
            const isPlaylistRunEntry = activeFilter?.kind === 'playlist'
              && group.id === playlistRatingAnchorId;
            const ratingSkillIds = activeFilter?.kind === 'playlist'
              ? isPlaylistRunEntry ? playlistRatingSkillIds : []
              : routine ? getRoutineSkillIds(routine) : [];
            const existingRatings = isPlaylistRunEntry ? playlistRatings : group.skillRatings ?? [];
            const unratedSkillIds = getUnratedSkillIds(ratingSkillIds, existingRatings);
            const missingNoteTargets = getSkillRatingsMissingNotes(existingRatings);
            const ratingScope = isPlaylistRunEntry ? 'playlist' : 'routine';
            const ratingSourceId = ratingScope === 'playlist' && activeFilter?.kind === 'playlist'
              ? activeFilter.id
              : group.id;
            const ratingContext = ratingScope === 'playlist'
              ? `Playlist: ${selectedPlaylist?.title ?? group.playlistRuns?.find(run => run.playlistId === ratingSourceId)?.playlistTitle ?? 'Playlist'}`
              : `Routine: ${group.title}`;
            const disclosureId = `${activeDay}:${group.id}:${ratingSourceId}`;
            const expanded = disclosure.isExpanded(disclosureId);

            return (
            <View key={group.id} style={[styles.routineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.routineHeader}>
                <View style={[styles.routineIcon, { backgroundColor: colors.sageSoft }]}>
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.success} />
                </View>
                <View style={styles.routineHeading}>
                  <Text style={[styles.routineTitle, { color: colors.foreground }]}>{group.title}</Text>
                  <Text style={[styles.routineMeta, { color: colors.mutedForeground }]}>
                    {group.steps.length} completed · {group.removed ? 'No longer in your routines' : group.hidden ? 'Currently hidden' : 'Routine'}
                    {group.playlistRuns?.length
                      ? ` · Playlist: ${group.playlistRuns.map(run => run.playlistTitle).join(', ')}`
                      : ''}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} history for ${group.title}`}
                  accessibilityState={{ expanded }} testID={`toggle-history-${group.id}`} onPress={() => disclosure.toggle(disclosureId)} style={styles.iconButton}>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
                </Pressable>
              </View>
              {expanded ? <>
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
              {unratedSkillIds.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add skill ratings and notes for ${ratingScope} ${ratingContext.replace(/^(Routine|Playlist): /, '')}`}
                  testID={`history-add-skill-ratings-${group.id}`}
                  onPress={() => openHistoryRatingPrompt(
                    group.title,
                    ratingSkillIds,
                    existingRatings,
                    ratingScope,
                    ratingSourceId,
                    group.id,
                    ratingContext,
                  )}
                  style={({ pressed }) => [
                    styles.ratingAction,
                    { backgroundColor: colors.sageSoft },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="star-outline" size={17} color={colors.success} />
                  <Text style={[styles.ratingActionText, { color: colors.success }]}>
                    {unratedSkillIds.length === ratingSkillIds.length
                      ? 'Add skill ratings and notes'
                      : 'Rate remaining skills'}
                  </Text>
                </Pressable>
              ) : null}
              {missingNoteTargets.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add missing reflection notes for ${ratingScope} ${ratingContext.replace(/^(Routine|Playlist): /, '')}`}
                  testID={`history-add-skill-notes-${group.id}`}
                  onPress={() => openHistoryNotePrompt(group.title, missingNoteTargets, ratingContext)}
                  style={({ pressed }) => [
                    styles.ratingAction,
                    { backgroundColor: colors.sageSoft },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="create-outline" size={17} color={colors.success} />
                  <Text style={[styles.ratingActionText, { color: colors.success }]}>
                    {missingNoteTargets.length === 1 ? 'Add missing note' : 'Add missing notes'}
                  </Text>
                </Pressable>
              ) : null}
          {group.skillRatings?.length ? (
                <View style={[styles.skillNotes, { borderTopColor: colors.border }]}>
                  <Text style={[styles.skillNotesHeading, { color: colors.foreground }]}>Skill ratings &amp; reflections</Text>
                  {groupSkillRatingEvents(group.skillRatings).map((event, eventIndex) => {
                    const eventKey = `${group.id}:${event.id}`;
                    const isSpeaking = speakingEventKey === eventKey;
                    return (
                    <View key={eventKey} style={[styles.skillEvent, { borderColor: colors.border }]}>
                      <View style={styles.skillEventHeader}>
                        <View style={styles.skillEventCopy}>
                          <Text style={[styles.skillEventTitle, { color: colors.foreground }]}>
                            {event.isRunTime ? `Run ${eventIndex + 1}` : `Rating ${eventIndex + 1}`}
                          </Text>
                          <Text style={[styles.skillEventTime, { color: colors.mutedForeground }]}>
                            {event.isRunTime ? 'Completed' : 'Recorded'} · {formatSkillRatingDateTime(event.dateTime)}
                          </Text>
                        </View>
                        <View style={styles.skillEventActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={isSpeaking
                              ? `Stop speaking ${group.title} skill ratings and reflections`
                              : `Speak ${group.title} skill ratings and reflections`}
                            accessibilityState={{ selected: isSpeaking }}
                            testID={`history-skill-speech-${event.id}`}
                            onPress={() => void speakSkillRatings(group.title, event, eventKey)}
                            style={({ pressed }) => [
                              styles.speechButton,
                              { backgroundColor: colors.sageSoft },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons
                              name={isSpeaking ? 'stop-circle-outline' : 'volume-high-outline'}
                              size={16}
                              color={colors.success}
                            />
                            <Text style={[styles.speechButtonText, { color: colors.success }]}>
                              {isSpeaking ? 'Stop' : 'Speak'}
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Export ${group.title} skill ratings as a PDF`}
                            accessibilityState={{ disabled: exportingRunId !== null }}
                            disabled={exportingRunId !== null}
                            testID={`history-skill-pdf-${event.id}`}
                            onPress={() => void exportSkillRatings(group.title, event)}
                            style={({ pressed }) => [
                              styles.pdfButton,
                              { backgroundColor: colors.secondary },
                              pressed && styles.pressed,
                            ]}
                          >
                            {exportingRunId === event.id
                              ? <ActivityIndicator size="small" color={colors.inkSoft} />
                              : <Ionicons name="document-text-outline" size={16} color={colors.inkSoft} />}
                            <Text style={[styles.pdfButtonText, { color: colors.inkSoft }]}>
                              {exportingRunId === event.id ? 'Preparing…' : 'Export PDF'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                      {event.ratings.map((entry, index) => (
                        <View key={entry.id} style={[styles.skillNote, { backgroundColor: colors.background }]}>
                          <View style={styles.skillNoteHeader}>
                            <Text style={[styles.skillNoteOrder, { color: colors.mutedForeground }]}>{index + 1}.</Text>
                            <Text style={[styles.skillNoteSkill, { color: colors.foreground }]}>{entry.skillName}</Text>
                            <Text style={[styles.skillNoteScore, { color: colors.primary }]}>{entry.rating}/10</Text>
                          </View>
                          <Text style={[styles.skillNoteText, { color: colors.inkSoft }]}>
                            {entry.note ?? 'No note added.'}
                          </Text>
                          {entry.note?.trim() ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit reflection for ${entry.skillName}`}
                              testID={`history-edit-reflection-${entry.ratingId}`}
                              onPress={() => setReflectionEditTarget({
                                skillId: entry.skillId,
                                ratingId: entry.ratingId,
                                rating: entry.rating,
                                note: entry.note ?? '',
                                ratedAt: entry.ratedAt,
                                ...(entry.completedDay ? { completedDay: entry.completedDay } : {}),
                                ...(entry.completedAt ? { completedAt: entry.completedAt } : {}),
                                contextLabel: `${entry.skillName} · ${ratingContext}`,
                              })}
                              style={({ pressed }) => [styles.editReflection, pressed && styles.pressed]}
                            >
                              <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                              <Text style={[styles.editReflectionText, { color: colors.primary }]}>Edit reflection</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      {exportError?.runId === event.id ? (
                        <Text accessibilityRole="alert" style={[styles.pdfError, { color: colors.destructive }]}>
                          {exportError.message}
                        </Text>
                      ) : null}
                      {speechError?.eventKey === eventKey ? (
                        <Text accessibilityRole="alert" style={[styles.pdfError, { color: colors.destructive }]}>
                          {speechError.message}
                        </Text>
                      ) : null}
                    </View>
                    );
                  })}
                </View>
              ) : null}
              </> : null}
            </View>
          );
          })}
        </>
      ) : (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="calendar-outline" size={32} color={colors.sage} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {filterKind === 'playlist' && selectedPlaylist
              ? 'No runs from this playlist yet'
              : filterKind === 'routine' && selectedRoutine
                ? 'No history for this routine yet'
                : filterKind === 'all'
                  ? 'No recorded progress yet'
                  : 'No matching history yet'}
          </Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            {filterKind === 'playlist'
              ? 'Only completions launched from this playlist appear in its history. New runs will show here.'
              : filterKind === 'routine'
                ? 'Completed steps from today and earlier days will show here.'
                : 'Completed steps from today and earlier days, including restored progress, will show up here.'}
          </Text>
        </View>
      )}
      <SkillRatingPrompt
        visible={ratingPrompt !== null}
        skillIds={ratingPrompt?.skillIds ?? []}
        routineTitle={ratingPrompt?.routineTitle ?? ''}
        contextLabel={ratingPrompt?.contextLabel}
        run={ratingPrompt?.mode === 'ratings' ? ratingPrompt.run : undefined}
        noteTargets={ratingPrompt?.mode === 'notes' ? ratingPrompt.noteTargets : undefined}
        onSkip={() => setRatingPrompt(null)}
        onSaved={() => setRatingPrompt(null)}
      />
      <SkillRatingPrompt
        visible={reflectionEditTarget !== null}
        skillIds={[]}
        routineTitle=""
        editTarget={reflectionEditTarget ?? undefined}
        onSkip={() => setReflectionEditTarget(null)}
        onSaved={() => setReflectionEditTarget(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1, marginBottom: 9 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.7 },
  intro: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 24 },
  filterBlock: { marginBottom: 18 },
  filterLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9, marginBottom: 9 },
  filterKinds: { flexDirection: 'row', gap: 8 },
  filterKindButton: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  filterKindText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  filterItems: { gap: 8, paddingTop: 10, paddingRight: 20 },
  filterItemButton: { maxWidth: 220, minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, justifyContent: 'center' },
  filterItemText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  filterEmpty: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10 },
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
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  routineIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  routineHeading: { flex: 1 },
  routineTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  routineMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1 },
  stepCopy: { flex: 1 },
  stepTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  stepNote: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  skillHistoryError: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  ratingAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, marginTop: 10 },
  ratingActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  skillNotes: { borderTopWidth: 1, paddingTop: 13, marginTop: 4 },
  skillNotesHeading: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 6 },
  skillEvent: { borderWidth: 1, borderRadius: 13, padding: 10, marginTop: 7 },
  skillEventHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, marginBottom: 3 },
  skillEventCopy: { flex: 1 },
  skillEventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  skillEventTime: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2 },
  skillEventActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  speechButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10 },
  speechButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  pdfButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10 },
  pdfButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  pdfError: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 6 },
  skillNote: { borderRadius: 11, padding: 10, marginTop: 5 },
  skillNoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  skillNoteOrder: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  skillNoteSkill: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flex: 1 },
  skillNoteScore: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  skillNoteText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 },
  editReflection: { minHeight: 36, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 3, paddingRight: 8 },
  editReflectionText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  empty: { borderWidth: 1, borderRadius: 19, padding: 25, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 12 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});