import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlaylists } from '@/context/PlaylistContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSchedules } from '@/context/ScheduleContext';
import { useSkills } from '@/context/SkillContext';
import { usePeople } from '@/context/PeopleContext';
import { SkillPicker, SkillTagList } from '@/components/SkillPicker';
import { StepDetailAttachments } from '@/components/StepDetailAttachments';
import { ExpandableRichDetailEditor } from '@/components/ExpandableRichDetailEditor';
import { useColors } from '@/hooks/useColors';
import { useSpeechVoice } from '@/hooks/useSpeechVoice';
import { createDefaultPlaylistStepSelections, resolvePlaylistReminderSettings, type PlaylistStepSelection } from '@/lib/playlists';
import { buildStepAnnouncement } from '@/lib/routineSpeech';
import { scheduledPlaylistSource } from '@/lib/schedules';
import { formatLocalDateTime } from '@/lib/localDateTime';
import { formatDuration, getStepSeconds } from '@/types/routines';
import type { Routine, RoutineNotificationSettings } from '@/types/routines';
import { detailHtmlToText } from '@/lib/stepDetailHtml';
import { filterRoutinesByStepKeywords } from '@/lib/routineSearch';

type PlaylistTimeDraft = { hours: string; minutes: string; seconds: string };

function durationToTimeDraft(durationSeconds: number): PlaylistTimeDraft {
  return {
    hours: String(Math.floor(durationSeconds / 3600)),
    minutes: String(Math.floor((durationSeconds % 3600) / 60)),
    seconds: String(durationSeconds % 60),
  };
}

function timeDraftToDuration(draft: PlaylistTimeDraft): number {
  const hours = Math.max(0, Number.parseInt(draft.hours, 10) || 0);
  const minutes = Math.min(59, Math.max(0, Number.parseInt(draft.minutes, 10) || 0));
  const seconds = Math.min(59, Math.max(0, Number.parseInt(draft.seconds, 10) || 0));
  return hours * 3600 + minutes * 60 + seconds;
}

export default function PlaylistEditor() {
  const { id, scheduleId } = useLocalSearchParams<{ id?: string; scheduleId?: string }>();
  const colors = useColors();
  const { activePerson } = usePeople();
  const { playlists, loading, error } = usePlaylists();
  const { loading: rLoading } = useRoutines();
  const { schedules, loading: sLoading, error: sError } = useSchedules();
  const existing = id ? playlists.find((p) => p.id === id) : undefined;
  const schedule = scheduleId ? schedules.find((s) => s.id === scheduleId) : undefined;
  const hasOverride = !!schedule?.playlistOverride;
  const scheduled = scheduleId ? (schedule && schedule.targetType === 'playlist' ? scheduledPlaylistSource(schedule, playlists) : null) : undefined;
  const busyLoad = loading || rLoading || (!!scheduleId && sLoading);
  const problem = scheduleId
    ? (sError || (!busyLoad && !schedule ? 'Scheduled playlist not found' : '') || (!busyLoad && !hasOverride && error ? error : '') || (!busyLoad && !scheduled ? 'The original playlist is unavailable.' : ''))
    : (error || (id && !existing ? 'Playlist not found' : ''));
  if (busyLoad || problem) {
    return (
      <View style={[styles.screen, styles.missing, { backgroundColor: colors.background }]}>
        <Text accessibilityRole={problem ? 'alert' : undefined} style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', textAlign: 'center', paddingHorizontal: 24 }}>
          {busyLoad ? 'Loading…' : problem}
        </Text>
        {!busyLoad ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}><Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Go back</Text></Pressable> : null}
      </View>
    );
  }
  const origOk = !!schedule && !!playlists.find((p) => p.id === schedule.targetId) && !error;
  const src = scheduled ?? existing;
  return <Editor key={scheduleId ? `s-${scheduleId}` : id ?? 'new'} editId={existing?.id} scheduleId={scheduleId} hasOverride={hasOverride} canReset={origOk}
    initialTitle={src?.title ?? ''} initialIds={src?.routineIds ?? []} initialStepSelections={src?.stepSelections} initialSkillIds={src?.skillIds ?? []}
    initialReflectionTemplateHtml={scheduleId ? '' : src?.reflectionTemplateHtml ?? ''}
    initialReflectionTemplate={scheduleId ? '' : src?.reflectionTemplate ?? ''}
    initialRateSkillsAtPlaylistEnd={src
      ? src.rateSkillsAtPlaylistEnd ?? true
      : activePerson.defaultRateSkillsAtPlaylistEnd}
    initialReminderSettings={resolvePlaylistReminderSettings(activePerson.defaultPlaylistReminderSettings, src?.reminderSettings)} />;
}

function Editor({ editId, scheduleId, hasOverride, canReset, initialTitle, initialIds, initialStepSelections, initialSkillIds,
  initialRateSkillsAtPlaylistEnd, initialReminderSettings, initialReflectionTemplate, initialReflectionTemplateHtml }: {
  editId?: string; scheduleId?: string; hasOverride: boolean; canReset: boolean;
  initialTitle: string; initialIds: string[]; initialStepSelections?: PlaylistStepSelection[]; initialSkillIds: string[]; initialRateSkillsAtPlaylistEnd: boolean;
  initialReminderSettings: RoutineNotificationSettings;
  initialReflectionTemplate?: string;
  initialReflectionTemplateHtml?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savePlaylist } = usePlaylists();
  const { schedules, savePlaylistForSchedule, resetScheduledPlaylist } = useSchedules();
  const appointment = scheduleId ? schedules.find(item => item.id === scheduleId) : undefined;
  const { activePerson } = usePeople();
  const speechVoiceId = useSpeechVoice(activePerson.speechVoiceId);
  const { routines } = useRoutines();
  const { skills } = useSkills();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [title, setTitle] = React.useState(initialTitle);
  const [entries, setEntries] = React.useState<PlaylistStepSelection[]>(() => initialStepSelections
    ? initialStepSelections.map(selection => ({ routineId: selection.routineId, steps: selection.steps.map(step => ({ ...step })) }))
    : createDefaultPlaylistStepSelections(initialIds, routines));
  const ids = entries.map(entry => entry.routineId);
  const [routineSearch, setRoutineSearch] = React.useState('');
  const [expandedEntry, setExpandedEntry] = React.useState<number | null>(null);
  const [expandedStepDetails, setExpandedStepDetails] = React.useState<Record<string, boolean>>({});
  const [durationDrafts, setDurationDrafts] = React.useState<Record<string, PlaylistTimeDraft>>({});
  const [skillIds, setSkillIds] = React.useState<string[]>(initialSkillIds);
  const [rateSkillsAtPlaylistEnd, setRateSkillsAtPlaylistEnd] = React.useState(initialRateSkillsAtPlaylistEnd);
  const [reminderSettings, setReminderSettings] = React.useState<RoutineNotificationSettings>({ ...initialReminderSettings });
  const [reflectionTemplateHtml, setReflectionTemplateHtml] = React.useState(initialReflectionTemplateHtml ?? '');
  const [reflectionTemplateText, setReflectionTemplateText] = React.useState(
    initialReflectionTemplateHtml
      ? detailHtmlToText(initialReflectionTemplateHtml)
      : initialReflectionTemplate ?? '',
  );
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const stepPreviewToken = React.useRef(0);
  React.useEffect(() => () => {
    stepPreviewToken.current += 1;
    void Speech.stop();
  }, []);
  const addable = filterRoutinesByStepKeywords(routines, skills, routineSearch)
    .filter(r => !r.hidden && r.steps.some(step => !step.hidden));

  function info(rid: string, selection?: PlaylistStepSelection) {
    const r = routines.find((x) => x.id === rid);
    if (!r || r.hidden) return null;
    const visible = new Set(r.steps.filter(step => !step.hidden).map(step => step.id));
    const selected = (selection?.steps ?? r.steps.filter(step => !step.hidden).map(step => ({ stepId: step.id, durationSeconds: getStepSeconds(step) })))
      .filter(step => visible.has(step.stepId));
    const secs = selected
      .reduce((sum, step) => sum + step.durationSeconds, 0);
    return { title: r.title, secs, selectedSteps: selected.length, totalSteps: visible.size };
  }
  function move(i: number, d: -1 | 1) {
    setEntries((cur) => {
      const n = [...cur];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
    setError('');
    void Haptics.selectionAsync();
  }
  function toggleStep(entryIndex: number, stepId: string) {
    setEntries(current => current.map((entry, index) => {
      if (index !== entryIndex) return entry;
      const selected = entry.steps.find(step => step.stepId === stepId);
      const next = selected ? entry.steps.filter(step => step.stepId !== stepId)
        : [...entry.steps, { stepId, durationSeconds: getStepSeconds(routines.find(item => item.id === entry.routineId)!.steps.find(step => step.id === stepId)!) }];
      const source = routines.find(item => item.id === entry.routineId);
      if (!source) return { ...entry, steps: next };
      const order = new Map(source.steps.map((step, position) => [step.id, position]));
      return { ...entry, steps: next.sort((a, b) => (order.get(a.stepId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.stepId) ?? Number.MAX_SAFE_INTEGER)) };
    }));
    setError('');
  }
  function updateDurationPart(entryIndex: number, stepId: string, part: keyof PlaylistTimeDraft, value: string) {
    const entry = entries[entryIndex];
    const selected = entry?.steps.find(step => step.stepId === stepId);
    if (!entry || !selected) return;
    const key = `${entry.routineId}:${stepId}`;
    const current = durationDrafts[key] ?? durationToTimeDraft(selected.durationSeconds);
    const next = { ...current, [part]: value };
    setDurationDrafts(currentDrafts => ({ ...currentDrafts, [key]: next }));
    const durationSeconds = timeDraftToDuration(next);
    if (durationSeconds > 0) {
      setEntries(currentEntries => currentEntries.map((item, index) => index === entryIndex
        ? { ...item, steps: item.steps.map(step => step.stepId === stepId ? { ...step, durationSeconds } : step) }
        : item));
    }
  }
  function speakStep(source: Routine, step: Routine['steps'][number]) {
    const token = ++stepPreviewToken.current;
    void Speech.stop().finally(() => {
      if (stepPreviewToken.current !== token) return;
      Speech.speak(buildStepAnnouncement({ ...source, steps: [step] }, 0, skills), {
        rate: 0.92,
        pitch: 1,
        voice: speechVoiceId,
      });
    });
  }
  async function save() {
    if (lock.current) return;
    if (!title.trim()) return setError('Give your playlist a name.');
    if (!entries.length || !entries.some(entry => entry.steps.length)) return setError('Add at least one selected step.');
    let invalidDuration = false;
    const entriesWithDurations = entries.map(entry => ({
      ...entry,
      steps: entry.steps.map(step => {
        const draft = durationDrafts[`${entry.routineId}:${step.stepId}`];
        if (!draft) return step;
        const durationSeconds = timeDraftToDuration(draft);
        if (durationSeconds <= 0) invalidDuration = true;
        return { ...step, durationSeconds };
      }),
    }));
    if (invalidDuration) return setError('Give each selected step a duration before saving.');
    lock.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      const availableSkills = new Set(skills.map(skill => skill.id));
      const savedSkillIds = skillIds.filter(id => availableSkills.has(id));
      if (scheduleId) await savePlaylistForSchedule(scheduleId, title, ids, savedSkillIds, reminderSettings, entriesWithDurations);
      else await savePlaylist(title, ids, editId, savedSkillIds, rateSkillsAtPlaylistEnd, reminderSettings, reflectionTemplateText, reflectionTemplateHtml, entriesWithDurations);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the playlist. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function reset() {
    if (lock.current || !scheduleId) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await resetScheduledPlaylist(scheduleId);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore the original playlist.');
      setConfirmReset(false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.top, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" testID="close-playlist-editor" disabled={busy} onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{scheduleId ? 'Edit for this date' : editId ? 'Edit playlist' : 'New playlist'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={scheduleId ? 'Save playlist for this date only' : 'Save playlist'} testID={scheduleId ? 'save-scheduled-playlist' : 'save-playlist'} disabled={busy} onPress={() => void save()}
          style={({ pressed }) => [styles.save, { backgroundColor: busy ? colors.secondary : colors.primary }, pressed && { opacity: 0.72 }]}>
          <Text style={[styles.saveText, { color: busy ? colors.mutedForeground : colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 40 }]} showsVerticalScrollIndicator={false}>
        {scheduleId ? (
          <View style={[styles.notice, { backgroundColor: colors.coralSoft }]}>
            {appointment ? (
              <Text style={[styles.saveText, { color: colors.foreground, marginBottom: 6 }]}>
                {formatLocalDateTime(new Date(appointment.scheduledAt), {
                  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </Text>
            ) : null}
            <Text style={[styles.count, { color: colors.foreground, fontSize: 13 }]}>
              Changes apply to this scheduled date and time only. The original saved playlist is unchanged.
            </Text>
          </View>
        ) : null}
        <Text style={[styles.label, { color: colors.inkSoft }]}>Name</Text>
        <TextInput accessibilityLabel="Playlist name" testID="playlist-name-input" placeholder="Name your playlist" placeholderTextColor={colors.mutedForeground}
          value={title} maxLength={100} editable={!busy} returnKeyType="done" onSubmitEditing={() => void save()}
          onChangeText={(t) => { setTitle(t); setError(''); }}
          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]} />
        <SkillPicker selectedIds={skillIds} onChange={setSkillIds} disabled={busy} testIDPrefix="playlist-skill" />
        {!scheduleId ? (
          <>
            <Text style={[styles.label, { color: colors.inkSoft }]}>Run reflection template (optional)</Text>
            <TextInput accessibilityLabel="Playlist reflection template" testID="playlist-reflection-template-input" multiline
              value={reflectionTemplateText} editable={!busy} placeholder="Add prompts to answer after the playlist"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={value => { setReflectionTemplateText(value); setReflectionTemplateHtml(''); }}
              style={[styles.input, { minHeight: 80, paddingVertical: 12, textAlignVertical: 'top', borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input }]} />
            <ExpandableRichDetailEditor label="Playlist reflection template" value={reflectionTemplateText}
              html={reflectionTemplateHtml} disabled={busy}
              onSave={(text, html) => { setReflectionTemplateText(text); setReflectionTemplateHtml(html); }} />
          </>
        ) : null}
        {!scheduleId ? (
          <View style={[styles.ratingSetting, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.ratingSettingCopy}>
              <Text style={[styles.ratingSettingTitle, { color: colors.foreground }]}>Rate skills after the full playlist</Text>
              <Text style={[styles.ratingSettingHint, { color: colors.mutedForeground }]}>
                When on, ask once after the last routine instead of after each routine. New playlists use the person default; you can change it here.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Ask for skill ratings after the full playlist"
              testID="playlist-rate-skills-at-end"
              disabled={busy}
              value={rateSkillsAtPlaylistEnd}
              onValueChange={setRateSkillsAtPlaylistEnd}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ) : null}
        {!scheduleId ? (
          <View style={[styles.reminderSettings, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.ratingSettingCopy}>
              <Text style={[styles.ratingSettingTitle, { color: colors.foreground }]}>Reminders</Text>
              <Text style={[styles.ratingSettingHint, { color: colors.mutedForeground }]}>
                {editId
                  ? 'These apply to runs started from this playlist. Changing them will not change the person defaults.'
                  : 'Starts with the person defaults. You can change these for this playlist.'}
              </Text>
            </View>
            <View style={[styles.reminderRow, { borderColor: colors.border }]}>
              <Text style={[styles.reminderLabel, { color: colors.foreground }]}>When a step finishes</Text>
              <Switch
                accessibilityLabel="Remind when a step finishes"
                testID="playlist-step-completion-reminder"
                disabled={busy}
                value={reminderSettings.stepCompletion}
                onValueChange={(value) => setReminderSettings(current => ({ ...current, stepCompletion: value }))}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            <View style={[styles.reminderRow, { borderColor: colors.border }]}>
              <Text style={[styles.reminderLabel, { color: colors.foreground }]}>When a routine finishes</Text>
              <Switch
                accessibilityLabel="Remind when a routine finishes"
                testID="playlist-routine-completion-reminder"
                disabled={busy}
                value={reminderSettings.routineCompletion}
                onValueChange={(value) => setReminderSettings(current => ({ ...current, routineCompletion: value }))}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.hdr}>
          <Text style={[styles.label, { color: colors.inkSoft, marginBottom: 0 }]}>Order</Text>
          <Text style={[styles.count, { color: colors.mutedForeground }]}>{ids.length} added</Text>
        </View>
        {ids.length === 0 ? <Text style={[styles.count, { color: colors.mutedForeground, marginBottom: 12 }]}>Tap a routine below to add it. Repeats are fine.</Text> : null}
        {entries.map((entry, i) => {
          const rid = entry.routineId;
          const r = info(rid, entry);
          const source = routines.find(item => item.id === rid);
          const chosen = new Map(entry.steps.map(step => [step.stepId, step]));
          const name = r?.title ?? 'Unavailable routine';
          return (
            <View key={`${rid}-${i}`} testID={`playlist-entry-${i}`}>
              <View style={[styles.entry, { backgroundColor: r ? colors.card : colors.secondary, borderColor: colors.border }]}>
                <View style={[styles.num, { backgroundColor: r ? colors.sageSoft : colors.border }]}>
                  <Text style={[styles.numText, { color: r ? colors.success : colors.mutedForeground }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryTitle, { color: r ? colors.foreground : colors.mutedForeground }]} numberOfLines={2}>{name}</Text>
                  <Text style={[styles.count, { color: colors.mutedForeground }]}>
                    {r ? `${r.selectedSteps} of ${r.totalSteps} ${r.totalSteps === 1 ? 'step' : 'steps'} · ${formatDuration(r.secs)}` : 'Hidden or missing · skipped when run'}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} up`} testID={`move-playlist-up-${i}`} disabled={i === 0 || busy} onPress={() => move(i, -1)} style={styles.act}>
                  <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.border : colors.primary} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} down`} testID={`move-playlist-down-${i}`} disabled={i === entries.length - 1 || busy} onPress={() => move(i, 1)} style={styles.act}>
                  <Ionicons name="chevron-down" size={20} color={i === entries.length - 1 ? colors.border : colors.primary} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name} at position ${i + 1}`} testID={`remove-playlist-entry-${i}`} disabled={busy}
                  onPress={() => { setEntries(current => current.filter((_, k) => k !== i)); setError(''); }} style={styles.act}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {source && !source.hidden ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${expandedEntry === i ? 'Hide' : 'Choose'} steps for ${name}`}
                  accessibilityState={{ expanded: expandedEntry === i }} testID={`toggle-playlist-steps-${i}`} disabled={busy}
                  onPress={() => setExpandedEntry(expandedEntry === i ? null : i)} style={[styles.stepPickerToggle, { borderColor: colors.border }]}>
                  <Ionicons name={expandedEntry === i ? 'chevron-up' : 'list-outline'} size={16} color={colors.primary} />
                  <Text style={[styles.stepPickerToggleText, { color: colors.primary }]}>
                    {expandedEntry === i ? 'Hide step choices' : 'Choose steps'}
                  </Text>
                </Pressable>
              ) : null}
              {expandedEntry === i && source && !source.hidden ? (
                <View style={[styles.stepSelection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.count, { color: colors.mutedForeground }]}>Choose visible steps. Duration changes apply only to this playlist.</Text>
                  {source.steps.filter(step => !step.hidden).map(step => {
                    const selected = chosen.get(step.id);
                    const detailKey = `${rid}:${i}:${step.id}`;
                    const detailExpanded = expandedStepDetails[detailKey] ?? false;
                    const detailCount = Math.max(
                      1,
                      step.detailHtml?.length ?? 0,
                      step.detailAttachments?.length ?? 0,
                      1 + (step.additionalDetails?.length ?? 0),
                    );
                    const details = Array.from({ length: detailCount }, (_, index) => {
                      const plainText = index === 0 ? step.description : step.additionalDetails?.[index - 1];
                      const htmlText = detailHtmlToText(step.detailHtml?.[index] ?? '').trim();
                      const attachments = step.detailAttachments?.[index] ?? [];
                      return {
                        index,
                        label: index === 0 ? 'Main detail' : `Additional detail ${index}`,
                        text: htmlText || plainText?.trim() || '',
                        attachments,
                        speak: step.detailSpeech?.[index] ?? step.speakDetails !== false,
                      };
                    }).filter(detail => detail.text || detail.attachments.length > 0);
                    return (
                      <View key={step.id} style={styles.playlistStepItem}>
                        <View style={[styles.selectedStep, { borderColor: colors.border }]}>
                          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${step.title}`}
                            testID={`playlist-step-${i}-${step.id}`} disabled={busy} onPress={() => toggleStep(i, step.id)} style={styles.stepCheck}>
                            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={19} color={selected ? colors.primary : colors.mutedForeground} />
                          </Pressable>
                          <Text style={[styles.selectedStepName, { color: colors.foreground }]} numberOfLines={2}>{step.title}</Text>
                          {details.length ? (
                            <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailExpanded }}
                              accessibilityLabel={`${detailExpanded ? 'Hide' : 'Show'} details for ${step.title}`}
                              testID={`toggle-playlist-step-details-${i}-${step.id}`}
                              onPress={() => setExpandedStepDetails(current => ({ ...current, [detailKey]: !detailExpanded }))}
                              style={styles.stepPreviewDetailsToggle}>
                              <Text style={[styles.stepPreviewAction, { color: colors.primary }]}>{detailExpanded ? 'Hide' : 'Details'}</Text>
                            </Pressable>
                          ) : null}
                          <Pressable accessibilityRole="button" accessibilityLabel={`Speak step ${step.title}`}
                            testID={`speak-playlist-step-${i}-${step.id}`} disabled={busy}
                            onPress={() => speakStep(source, step)} style={styles.stepPreviewSpeak}>
                            <Ionicons name="volume-high-outline" size={18} color={colors.primary} />
                          </Pressable>
                        </View>
                        {selected ? (() => {
                          const draft = durationDrafts[`${entry.routineId}:${step.id}`] ?? durationToTimeDraft(selected.durationSeconds);
                          return (
                            <View style={styles.durationComposer}>
                              <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>Timer</Text>
                              <View style={styles.timeInputs}>
                                <TextInput accessibilityLabel={`Playlist step hours for ${step.title}`}
                                  testID={`playlist-duration-${i}-${step.id}-hours`} keyboardType="number-pad" maxLength={2}
                                  value={draft.hours} editable={!busy} onChangeText={value => updateDurationPart(i, step.id, 'hours', value)}
                                  style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]} />
                                <Text style={[styles.timeColon, { color: colors.mutedForeground }]}>:</Text>
                                <TextInput accessibilityLabel={`Playlist step minutes for ${step.title}`}
                                  testID={`playlist-duration-${i}-${step.id}-minutes`} keyboardType="number-pad" maxLength={2}
                                  value={draft.minutes} editable={!busy} onChangeText={value => updateDurationPart(i, step.id, 'minutes', value)}
                                  style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]} />
                                <Text style={[styles.timeColon, { color: colors.mutedForeground }]}>:</Text>
                                <TextInput accessibilityLabel={`Playlist step seconds for ${step.title}`}
                                  testID={`playlist-duration-${i}-${step.id}-seconds`} keyboardType="number-pad" maxLength={2}
                                  value={draft.seconds} editable={!busy} onChangeText={value => updateDurationPart(i, step.id, 'seconds', value)}
                                  style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]} />
                                <Text style={[styles.timeHint, { color: colors.mutedForeground }]}>h&nbsp;&nbsp; m&nbsp;&nbsp; s</Text>
                              </View>
                            </View>
                          );
                        })() : null}
                        {detailExpanded && details.length ? (
                          <View style={[styles.stepPreviewDetails, { backgroundColor: colors.background }]}>
                            <Text style={[styles.count, { color: colors.mutedForeground }]}>
                              Source duration: {formatDuration(getStepSeconds(step))}
                            </Text>
                            {step.skillIds?.length ? <SkillTagList skillIds={step.skillIds} /> : null}
                            {details.map(detail => (
                              <View key={`${step.id}-detail-${detail.index}`} style={styles.stepPreviewDetailBlock}>
                                <Text style={[styles.stepPreviewDetailLabel, { color: colors.foreground }]}>{detail.label}</Text>
                                {detail.text ? <Text style={[styles.stepPreviewDetailText, { color: colors.inkSoft }]}>{detail.text}</Text> : null}
                                {detail.attachments.length ? (
                                  <StepDetailAttachments
                                    label={`${detail.label} files`}
                                    testID={`playlist-step-files-${i}-${step.id}-${detail.index}`}
                                    attachments={detail.attachments}
                                  />
                                ) : null}
                                <Text style={[styles.stepPreviewSpeechHint, { color: colors.mutedForeground }]}>
                                  {detail.speak ? 'Spoken during the routine' : 'Not spoken during the routine'}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  {entry.steps.some(step => !source.steps.some(current => current.id === step.stepId && !current.hidden))
                    ? <Text style={[styles.count, { color: colors.mutedForeground, marginTop: 6 }]}>Some saved steps are now hidden or unavailable and will be skipped.</Text>
                    : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <Text style={[styles.label, { color: colors.inkSoft, marginTop: 18 }]}>Find routines and steps</Text>
        <TextInput accessibilityLabel="Search routines and steps" testID="playlist-step-search" value={routineSearch}
          onChangeText={setRoutineSearch} placeholder="Search titles, details, skills, categories" placeholderTextColor={colors.mutedForeground}
          returnKeyType="search" style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]} />
        {addable.length === 0 ? <Text style={[styles.count, { color: colors.mutedForeground }]}>{routineSearch ? 'No routines match that search.' : 'No visible routines with visible steps yet.'}</Text> : null}
        {addable.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Add ${r.title}`} testID={`add-routine-${r.id}`} disabled={busy || ids.length >= 100}
            onPress={() => {
              setEntries(current => [...current, ...createDefaultPlaylistStepSelections([r.id], routines)]);
              setError('');
              void Haptics.selectionAsync();
            }}
            style={({ pressed }) => [styles.entry, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.72 }]}>
            <View style={[styles.num, { backgroundColor: colors.coralSoft }]}><Ionicons name="add" size={17} color={colors.primary} /></View>
            <Text style={[styles.entryTitle, { flex: 1, color: colors.foreground }]} numberOfLines={1}>{r.title}</Text>
          </Pressable>
        ))}
        {error ? <Text accessibilityRole="alert" testID="playlist-error" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {scheduleId && hasOverride ? (
          confirmReset ? (
            <View style={[styles.notice, { backgroundColor: colors.coralSoft, marginTop: 18 }]}>
              <Text style={[styles.count, { color: colors.foreground, fontSize: 13 }]}>Discard this date's version and use the original playlist? Your edits for this date will be lost.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Keep date version" testID="cancel-reset-scheduled-playlist" disabled={busy} onPress={() => setConfirmReset(false)} style={styles.rbtn}>
                  <Text style={[styles.saveText, { color: colors.mutedForeground }]}>Keep</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Confirm use original playlist" testID="confirm-reset-scheduled-playlist" disabled={busy} onPress={() => void reset()} style={[styles.rbtn, { backgroundColor: colors.destructive }]}>
                  <Text style={[styles.saveText, { color: colors.destructiveForeground }]}>{busy ? 'Restoring…' : 'Use original'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Use original playlist for this date" accessibilityState={{ disabled: !canReset || busy }} testID="reset-scheduled-playlist" disabled={!canReset || busy}
                onPress={() => setConfirmReset(true)} style={[styles.rbtn, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.saveText, { color: canReset ? colors.primary : colors.mutedForeground }]}>Use original playlist for this date</Text>
              </Pressable>
              {!canReset ? <Text style={[styles.count, { color: colors.mutedForeground, marginTop: 6 }]}>The original playlist is missing or unavailable, so this date's version is kept.</Text> : null}
            </View>
          )
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: 14, padding: 12, marginBottom: 14 },
  ratingSetting: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  reminderSettings: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 8, marginBottom: 10 },
  reminderRow: { minHeight: 42, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14 },
  ratingSettingCopy: { flex: 1, gap: 4 },
  ratingSettingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  ratingSettingHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  rbtn: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  screen: { flex: 1 },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  save: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3, marginBottom: 9 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, fontFamily: 'Inter_500Medium', fontSize: 16, marginBottom: 11 },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 9 },
  count: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  entry: { minHeight: 60, borderWidth: 1, borderRadius: 15, paddingLeft: 12, paddingRight: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  entryTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  act: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepPickerToggle: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 11, alignSelf: 'flex-start', marginTop: -3, marginBottom: 10 },
  stepPickerToggleText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  stepSelection: { borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 10 },
  playlistStepItem: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  selectedStep: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepCheck: { width: 36, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  selectedStepName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  stepPreviewDetailsToggle: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 5 },
  stepPreviewAction: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  stepPreviewSpeak: { width: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  stepPreviewDetails: { padding: 9, borderRadius: 9, marginBottom: 8, gap: 4 },
  stepPreviewDetailBlock: { gap: 4, paddingTop: 6 },
  stepPreviewDetailLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  stepPreviewDetailText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  stepPreviewSpeechHint: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 },
  durationComposer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  durationLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  timeInputs: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { width: 35, height: 30, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12, padding: 0 },
  timeColon: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginHorizontal: 3 },
  timeHint: { fontFamily: 'Inter_400Regular', fontSize: 9, marginLeft: 6 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 10 },
});
