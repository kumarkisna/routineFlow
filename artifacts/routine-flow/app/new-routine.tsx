import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useRoutines } from '@/context/RoutineContext';
import { usePeople } from '@/context/PeopleContext';
import { useSkills } from '@/context/SkillContext';
import { SkillPicker, SkillTagList } from '@/components/SkillPicker';
import { StepDetailAttachments } from '@/components/StepDetailAttachments';
import { ExpandableRichDetailEditor } from '@/components/ExpandableRichDetailEditor';
import { useColors } from '@/hooks/useColors';
import { listRoutineCategories, MAX_CATEGORY_LENGTH, normalizeCategory, categoryKey } from '@/lib/routineCategories';
import { moveRoutineStep } from '@/lib/routineStepOrdering';
import {
  addAdditionalStepDetail,
  buildStepDetailFields,
  createEmptyStepDetailDraft,
  createStepDetailDraft,
  removeAdditionalStepDetail,
  setStepDetailSpeech as setDraftDetailSpeech,
  addStepDetailAttachment,
  removeStepDetailAttachment,
  setStepDetailHtml as setDraftDetailHtml,
  updateAdditionalStepDetail,
  type StepDetailDraft,
} from '@/lib/stepDetailDraft';
import { formatDuration, getStepDetails, getStepSeconds } from '@/types/routines';
import type { Routine, RoutineStep } from '@/types/routines';

export default function NewRoutineScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { routines, loading } = useRoutines();
  const editingRoutine = editId ? routines.find((item) => item.id === editId) : undefined;
  if (editId && (loading || !editingRoutine)) {
    return (
      <View style={styles.missing}>
        <Text>{loading ? 'Loading routine…' : 'Routine not found'}</Text>
        {!loading ? <Pressable onPress={() => router.back()}><Text>Go back</Text></Pressable> : null}
      </View>
    );
  }
  return <RoutineForm key={editId ?? 'new'} editingRoutine={editingRoutine} />;
}

function RoutineForm({ editingRoutine }: { editingRoutine?: Routine }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { routines, createRoutine, updateRoutine } = useRoutines();
  const { activePerson } = usePeople();
  const { skills } = useSkills();
  const [title, setTitle] = useState(editingRoutine?.title ?? '');
  const [subtitle, setSubtitle] = useState(editingRoutine?.subtitle ?? '');
  const [subtitleHtml, setSubtitleHtml] = useState(editingRoutine?.subtitleHtml ?? '');
  const [reflectionTemplate, setReflectionTemplate] = useState(editingRoutine?.reflectionTemplate ?? '');
  const [reflectionTemplateHtml, setReflectionTemplateHtml] = useState(editingRoutine?.reflectionTemplateHtml ?? '');
  const [speakSubtitle, setSpeakSubtitle] = useState(
    editingRoutine ? editingRoutine.speakSubtitle ?? true : activePerson.defaultSpeakRoutineDescription,
  );
  const [descriptionAttachments, setDescriptionAttachments] = useState(editingRoutine?.descriptionAttachments ?? []);
  const [category, setCategory] = useState(editingRoutine?.category ?? '');
  const [stepDraft, setStepDraft] = useState('');
  const [stepDetailDraft, setStepDetailDraft] = useState<StepDetailDraft>(createEmptyStepDetailDraft);
  const stepDescriptionDraft = stepDetailDraft.description;
  const additionalDetailsDraft = stepDetailDraft.additionalDetails;
  const detailSpeechDraft = stepDetailDraft.detailSpeech;
  const detailAttachmentsDraft = stepDetailDraft.detailAttachments;
  const detailHtmlDraft = stepDetailDraft.detailHtml;
  const [hoursDraft, setHoursDraft] = useState('0');
  const [minutesDraft, setMinutesDraft] = useState('5');
  const [secondsDraft, setSecondsDraft] = useState('0');
  const [steps, setSteps] = useState<RoutineStep[]>(editingRoutine?.steps ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(editingRoutine?.skillIds ?? []);
  const [stepSkillIds, setStepSkillIds] = useState<string[]>([]);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => title.trim().length > 0 && steps.length > 0, [title, steps.length]);
  const existingCategories = listRoutineCategories(routines);

  function clearStepDraft() {
    setEditingStepId(null);
    setStepDraft('');
    setStepDetailDraft(createEmptyStepDetailDraft());
    setStepSkillIds([]);
    setHoursDraft('0');
    setMinutesDraft('5');
    setSecondsDraft('0');
  }

  function editStep(step: RoutineStep) {
    const duration = getStepSeconds(step);
    setEditingStepId(step.id);
    setStepDraft(step.title);
    setStepDetailDraft(createStepDetailDraft(step));
    setStepSkillIds([...(step.skillIds ?? [])]);
    setHoursDraft(String(Math.floor(duration / 3600)));
    setMinutesDraft(String(Math.floor((duration % 3600) / 60)));
    setSecondsDraft(String(duration % 60));
    setError('');
  }

  function setDetailSpeech(index: number, speak: boolean) {
    setStepDetailDraft(current => setDraftDetailSpeech(current, index, speak));
  }

  function addStep() {
    const nextTitle = stepDraft.trim();
    const detailFields = buildStepDetailFields(stepDetailDraft);
    const nextDescription = detailFields.description;
    const nextAdditionalDetails = detailFields.additionalDetails;
    const nextDetailSpeech = detailFields.detailSpeech;
    const nextDetailAttachments = detailFields.detailAttachments;
    const nextDetailHtml = detailFields.detailHtml;
    if (!nextTitle) {
      setError('Give this step a name.');
      return;
    }
    const hours = Math.max(0, Number.parseInt(hoursDraft, 10) || 0);
    const minutes = Math.min(59, Math.max(0, Number.parseInt(minutesDraft, 10) || 0));
    const seconds = Math.min(59, Math.max(0, Number.parseInt(secondsDraft, 10) || 0));
    const durationSeconds = hours * 3600 + minutes * 60 + seconds;
    if (durationSeconds === 0) {
      setError('Give this step a duration before adding it.');
      return;
    }
    if (editingStepId) {
      setSteps((current) => current.map((step) =>
        step.id === editingStepId
          ? { ...step, title: nextTitle, description: nextDescription, additionalDetails: nextAdditionalDetails, detailSpeech: nextDetailSpeech, detailAttachments: nextDetailAttachments, detailHtml: nextDetailHtml, speakDetails: undefined, skillIds: [...stepSkillIds], durationSeconds }
          : step,
      ));
    } else {
      setSteps((current) => [
        ...current,
        {
          id: `${Date.now().toString()}-${Math.random().toString(36).slice(2, 7)}`,
          title: nextTitle,
          description: nextDescription,
          additionalDetails: nextAdditionalDetails,
          detailSpeech: nextDetailSpeech,
          detailAttachments: nextDetailAttachments,
          detailHtml: nextDetailHtml,
          ...(stepSkillIds.length ? { skillIds: [...stepSkillIds] } : {}),
          durationSeconds,
        },
      ]);
    }
    clearStepDraft();
    setError('');
    void Haptics.selectionAsync();
  }

  function moveStep(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => moveRoutineStep(current, index, direction));
    void Haptics.selectionAsync();
  }

  function toggleStepVisibility(stepId: string) {
    setSteps((current) => current.map((step) =>
      step.id === stepId ? { ...step, hidden: !step.hidden } : step,
    ));
    setError('');
    void Haptics.selectionAsync();
  }

  async function save() {
    if (saving) return;
    if (!title.trim()) {
      setError('Give your routine a name first.');
      return;
    }
    let stepsToSave = steps;
    if (editingStepId) {
      const editedTitle = stepDraft.trim();
      if (!editedTitle) {
        setError('Give this step a name before saving the routine.');
        return;
      }
      const hours = Math.max(0, Number.parseInt(hoursDraft, 10) || 0);
      const minutes = Math.min(59, Math.max(0, Number.parseInt(minutesDraft, 10) || 0));
      const seconds = Math.min(59, Math.max(0, Number.parseInt(secondsDraft, 10) || 0));
      const durationSeconds = hours * 3600 + minutes * 60 + seconds;
      if (durationSeconds === 0) {
        setError('Give this step a duration before saving the routine.');
        return;
      }
      const detailFields = buildStepDetailFields(stepDetailDraft);
      if (!steps.some(step => step.id === editingStepId)) {
        setError('The step being edited is no longer in this routine.');
        return;
      }
      stepsToSave = steps.map(step => step.id === editingStepId ? {
        ...step,
        title: editedTitle,
        ...detailFields,
        speakDetails: undefined,
        skillIds: [...stepSkillIds],
        durationSeconds,
      } : step);
    }
    if (stepsToSave.length === 0) {
      setError('Add at least one step to make this routine repeatable.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      const savedCategory = normalizeCategory(category, existingCategories);
      const availableSkills = new Set(skills.map(skill => skill.id));
      const savedSkillIds = skillIds.filter(id => availableSkills.has(id));
      const savedSteps = stepsToSave.map(step => ({
        ...step,
        ...(step.skillIds ? { skillIds: step.skillIds.filter(id => availableSkills.has(id)) } : {}),
      }));
      if (editingRoutine) {
        await updateRoutine(editingRoutine.id, title.trim(), subtitle.trim() || 'A routine made for your day', savedSteps, savedCategory, savedSkillIds, subtitleHtml, speakSubtitle, descriptionAttachments, reflectionTemplate, reflectionTemplateHtml);
        router.back();
      } else {
        const routine = await createRoutine(title.trim(), subtitle.trim() || 'A routine made for your day', savedSteps, savedCategory, savedSkillIds, subtitleHtml, speakSubtitle, descriptionAttachments, reflectionTemplate, reflectionTemplateHtml);
        router.replace({ pathname: '/routine/[id]', params: { id: routine.id } });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Could not save the routine. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{editingRoutine ? 'Edit routine' : 'New routine'}</Text>
        <Pressable
          accessibilityLabel="Save routine"
          disabled={!canSave || saving || Boolean(editingStepId)}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: canSave && !saving && !editingStepId ? colors.primary : colors.secondary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.saveText, { color: canSave && !saving && !editingStepId ? colors.primaryForeground : colors.mutedForeground }]}>
            {saving ? 'Saving' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.intro, { backgroundColor: colors.hero }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.accent }]}>
            <Feather name="plus" size={20} color={colors.accentForeground} />
          </View>
          <Text style={[styles.introTitle, { color: colors.heroForeground }]}>{editingRoutine ? 'Make this flow yours' : 'Make it easy to begin'}</Text>
          <Text style={[styles.introText, { color: colors.heroForeground }]}>
            {editingRoutine ? 'Update your steps and timers for the next time you run this routine.' : 'Save the small sequence you want to return to again and again.'}
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.inkSoft }]}>Routine details</Text>
        <TextInput
          accessibilityLabel="Routine name"
          placeholder="Name your routine"
          placeholderTextColor={colors.mutedForeground}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setError('');
          }}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
        <TextInput
          accessibilityLabel="Routine description"
          placeholder="What does it help you do?"
          placeholderTextColor={colors.mutedForeground}
          value={subtitle}
          onChangeText={(value) => {
            setSubtitle(value);
            setSubtitleHtml('');
          }}
          style={[styles.input, styles.descriptionInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
        <ExpandableRichDetailEditor
          label="Routine description"
          value={subtitle}
          html={subtitleHtml}
          disabled={saving}
          onSave={(text, html) => {
            setSubtitle(text);
            setSubtitleHtml(html);
          }}
        />
        <StepDetailAttachments
          attachments={descriptionAttachments}
          onAddAttachment={attachment => setDescriptionAttachments(current => [...current, attachment])}
          onRemoveAttachment={id => setDescriptionAttachments(current => current.filter(attachment => attachment.id !== id))}
          disabled={saving}
          testID="routine-description-attachments"
          label="Files in routine description"
        />
        <Text style={[styles.label, { color: colors.inkSoft }]}>Run reflection template (optional)</Text>
        <TextInput
          accessibilityLabel="Routine run reflection template"
          testID="routine-reflection-template"
          multiline
          value={reflectionTemplate}
          editable={!saving}
          onChangeText={value => { setReflectionTemplate(value); setReflectionTemplateHtml(''); }}
          placeholder="Start a reflection for after each run…"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, styles.descriptionInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
        <ExpandableRichDetailEditor
          label="Run reflection template"
          value={reflectionTemplate}
          html={reflectionTemplateHtml}
          disabled={saving}
          onSave={(text, html) => { setReflectionTemplate(text); setReflectionTemplateHtml(html); }}
        />
        <View style={[styles.speechPreference, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.speechPreferenceText}>
            <Text style={[styles.speechPreferenceTitle, { color: colors.foreground }]}>Speak routine description</Text>
            <Text style={[styles.speechPreferenceHint, { color: colors.mutedForeground }]}>Read it before the first step when this routine is spoken.</Text>
          </View>
          <Switch
            accessibilityLabel="Speak routine description"
            value={speakSubtitle}
            onValueChange={setSpeakSubtitle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <SkillPicker selectedIds={skillIds} onChange={setSkillIds} disabled={saving} testIDPrefix="routine-skill" />
        <Text style={[styles.categoryLabel, { color: colors.inkSoft }]}>Category (optional)</Text>
        <TextInput
          accessibilityLabel="Routine category"
          testID="routine-category-input"
          placeholder="e.g. Health, Work, Evening"
          placeholderTextColor={colors.mutedForeground}
          value={category}
          maxLength={MAX_CATEGORY_LENGTH}
          onChangeText={setCategory}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
        {existingCategories.length > 0 ? (
          <View style={styles.categorySuggestions}>
            {existingCategories.map((name) => (
              <Pressable
                key={categoryKey(name)}
                accessibilityLabel={`Use category ${name}`}
                onPress={() => setCategory(name)}
                style={({ pressed }) => [
                  styles.categorySuggestion,
                  { backgroundColor: categoryKey(category) === categoryKey(name) ? colors.coralSoft : colors.secondary },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.categorySuggestionText, { color: colors.foreground }]}>{name}</Text>
              </Pressable>
            ))}
            {category.trim() ? (
              <Pressable
                accessibilityLabel="Remove category"
                onPress={() => setCategory('')}
                style={({ pressed }) => [styles.categorySuggestion, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
              >
                <Text style={[styles.categorySuggestionText, { color: colors.mutedForeground }]}>No category</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.stepsHeader}>
          <Text style={[styles.label, { color: colors.inkSoft, marginBottom: 0 }]}>Steps</Text>
          <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>{steps.length} added</Text>
        </View>
        <View style={[styles.stepComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stepComposerTop}>
            <TextInput
              accessibilityLabel={editingStepId ? 'Edit routine step' : 'New routine step'}
              placeholder="Add a step"
              placeholderTextColor={colors.mutedForeground}
              value={stepDraft}
              onChangeText={(value) => {
                setStepDraft(value);
                setError('');
              }}
              returnKeyType="next"
              style={[styles.stepInput, { color: colors.foreground }]}
            />
            <Pressable
              accessibilityLabel={editingStepId ? 'Update step' : 'Add step'}
              onPress={addStep}
              style={({ pressed }) => [
                styles.addStepButton,
                { backgroundColor: stepDraft.trim() ? colors.primary : colors.secondary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={editingStepId ? 'checkmark' : 'add'} size={22} color={stepDraft.trim() ? colors.primaryForeground : colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[styles.stepDescriptionLabel, { color: colors.mutedForeground }]}>Step details (optional)</Text>
          <TextInput
            accessibilityLabel="Step details"
            testID="step-description-input"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholder="Add instructions or a helpful note"
            placeholderTextColor={colors.mutedForeground}
            value={stepDescriptionDraft}
            onChangeText={(description) => setStepDetailDraft((current) => ({ ...current, description, detailHtml: current.detailHtml.map((html, index) => index === 0 ? '' : html) }))}
            style={[styles.stepDescriptionInput, { borderColor: colors.border, color: colors.foreground }]}
          />
          <ExpandableRichDetailEditor label="Main step detail" value={stepDescriptionDraft} html={detailHtmlDraft[0] ?? ''} disabled={saving}
            onSave={(description, html) => setStepDetailDraft(current => setDraftDetailHtml({ ...current, description }, 0, html))} />
          <StepDetailAttachments label="Files for main detail" testID="main-detail-files" attachments={detailAttachmentsDraft[0] ?? []} disabled={saving}
            onAddAttachment={file => setStepDetailDraft(current => addStepDetailAttachment(current, 0, file))}
            onRemoveAttachment={id => setStepDetailDraft(current => removeStepDetailAttachment(current, 0, id))} />
          <View style={styles.detailSpeechRow}>
            <Text style={[styles.detailSpeechLabel, { color: colors.inkSoft }]}>Speak main detail aloud</Text>
            <Switch
              accessibilityLabel="Speak the main step detail during the routine"
              testID="speak-step-description"
              disabled={saving}
              value={detailSpeechDraft[0] ?? true}
              onValueChange={(speak) => setDetailSpeech(0, speak)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {additionalDetailsDraft.map((detail, index) => (
            <View key={`detail-${index}`}>
              <View style={styles.additionalDetailRow}>
                <TextInput
                  accessibilityLabel={`Additional detail ${index + 1}`}
                  testID={`additional-step-detail-${index}`}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholder={`Additional detail ${index + 1}`}
                  placeholderTextColor={colors.mutedForeground}
                  value={detail}
                  onChangeText={(value) => setStepDetailDraft((current) =>
                    setDraftDetailHtml(updateAdditionalStepDetail(current, index, value), index + 1, ''),
                  )}
                  style={[
                    styles.stepDescriptionInput,
                    styles.additionalDetailInput,
                    { borderColor: colors.border, color: colors.foreground },
                  ]}
                />
                <ExpandableRichDetailEditor label={`Additional detail ${index + 1}`} value={detail} html={detailHtmlDraft[index + 1] ?? ''} disabled={saving}
                  onSave={(text, html) => setStepDetailDraft(current => setDraftDetailHtml(updateAdditionalStepDetail(current, index, text), index + 1, html))} />
                <StepDetailAttachments label={`Files for detail ${index + 1}`} testID={`additional-detail-files-${index}`} attachments={detailAttachmentsDraft[index + 1] ?? []} disabled={saving}
                  onAddAttachment={file => setStepDetailDraft(current => addStepDetailAttachment(current, index + 1, file))}
                  onRemoveAttachment={id => setStepDetailDraft(current => removeStepDetailAttachment(current, index + 1, id))} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove additional detail ${index + 1}`}
                  testID={`remove-step-detail-${index}`}
                  onPress={() => setStepDetailDraft((current) => removeAdditionalStepDetail(current, index))}
                  style={({ pressed }) => [styles.removeDetailButton, pressed && styles.pressed]}
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <View style={styles.detailSpeechRow}>
                <Text style={[styles.detailSpeechLabel, { color: colors.inkSoft }]}>
                  {`Speak additional detail ${index + 1} aloud`}
                </Text>
                <Switch
                  accessibilityLabel={`Speak additional detail ${index + 1} during the routine`}
                  testID={`speak-additional-step-detail-${index}`}
                  disabled={saving}
                  value={detailSpeechDraft[index + 1] ?? true}
                  onValueChange={(speak) => setDetailSpeech(index + 1, speak)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another step detail"
            testID="add-step-detail"
            onPress={() => setStepDetailDraft((current) => addAdditionalStepDetail(current))}
            style={({ pressed }) => [styles.addDetailButton, pressed && styles.pressed]}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.addDetailText, { color: colors.primary }]}>Add another detail</Text>
          </Pressable>
          <SkillPicker
            label="Step skills (optional)"
            selectedIds={stepSkillIds}
            onChange={setStepSkillIds}
            disabled={saving}
            testIDPrefix="step-skill"
          />
          <View style={styles.durationComposer}>
            <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>Timer</Text>
            <View style={styles.timeInputs}>
              <TextInput
                accessibilityLabel="Step hours"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setHoursDraft}
                placeholder="00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={hoursDraft}
              />
              <Text style={[styles.timeColon, { color: colors.mutedForeground }]}>:</Text>
              <TextInput
                accessibilityLabel="Step minutes"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setMinutesDraft}
                placeholder="05"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={minutesDraft}
              />
              <Text style={[styles.timeColon, { color: colors.mutedForeground }]}>:</Text>
              <TextInput
                accessibilityLabel="Step seconds"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setSecondsDraft}
                placeholder="00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={secondsDraft}
              />
              <Text style={[styles.timeHint, { color: colors.mutedForeground }]}>h&nbsp;&nbsp; m&nbsp;&nbsp; s</Text>
            </View>
          </View>
          {editingStepId ? (
            <Pressable accessibilityLabel="Cancel editing step" onPress={clearStepDraft} style={styles.cancelEdit}>
              <Text style={[styles.cancelEditText, { color: colors.primary }]}>Cancel editing step</Text>
            </Pressable>
          ) : null}
        </View>

        {steps.map((step, index) => (
          <View key={step.id} style={[styles.stepRow, { backgroundColor: step.hidden ? colors.secondary : colors.card, borderColor: colors.border }]}>
            <View style={[styles.number, { backgroundColor: step.hidden ? colors.border : colors.sageSoft }]}>
              <Text style={[styles.numberText, { color: step.hidden ? colors.mutedForeground : colors.success }]}>{index + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={[styles.stepTitle, { color: step.hidden ? colors.mutedForeground : colors.foreground }]}>{step.title}</Text>
              {step.hidden ? <Text style={[styles.stepDescription, { color: colors.mutedForeground }]}>Hidden · skipped in timer</Text> : null}
              {getStepDetails(step).length > 0 ? (
                <Text style={[styles.stepDescription, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {getStepDetails(step).join(' · ')}
                </Text>
              ) : null}
              {step.detailAttachments?.map((attachments, detailIndex) => attachments.length ? (
                <StepDetailAttachments
                  key={`${step.id}-saved-files-${detailIndex}`}
                  label={detailIndex === 0 ? 'Main detail files' : `Detail ${detailIndex} files`}
                  testID={`saved-step-files-${step.id}-${detailIndex}`}
                  attachments={attachments}
                />
              ) : null)}
              <SkillTagList skillIds={step.skillIds} />
              <Text style={[styles.stepDuration, { color: colors.mutedForeground }]}>
                {formatDuration(getStepSeconds(step))}
              </Text>
              <Pressable
                accessibilityLabel={`${step.hidden ? 'Show' : 'Hide'} step ${step.title}`}
                testID={`edit-toggle-step-visibility-${step.id}`}
                onPress={() => toggleStepVisibility(step.id)}
                style={({ pressed }) => [styles.visibilityToggle, pressed && styles.pressed]}
              >
                <Ionicons name={step.hidden ? 'eye-outline' : 'eye-off-outline'} size={16} color={colors.primary} />
                <Text style={[styles.visibilityText, { color: colors.primary }]}>{step.hidden ? 'Show step' : 'Hide step'}</Text>
              </Pressable>
            </View>
            <View style={styles.stepActions}>
              <View>
                <Pressable
                  accessibilityLabel={`Move ${step.title} up`}
                  testID={`move-step-up-${step.id}`}
                  disabled={index === 0}
                  onPress={() => moveStep(index, -1)}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.border : colors.primary} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Move ${step.title} down`}
                  testID={`move-step-down-${step.id}`}
                  disabled={index === steps.length - 1}
                  onPress={() => moveStep(index, 1)}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-down" size={20} color={index === steps.length - 1 ? colors.border : colors.primary} />
                </Pressable>
              </View>
              <View>
                <Pressable
                  accessibilityLabel={`Edit ${step.title}`}
                  testID={`edit-step-${step.id}`}
                  onPress={() => editStep(step)}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Remove ${step.title}`}
                  onPress={() => {
                    if (editingStepId === step.id) clearStepDraft();
                    setSteps((current) => current.filter((item) => item.id !== step.id));
                  }}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="close-circle-outline" size={19} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  saveButton: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  intro: { borderRadius: 24, padding: 20, marginBottom: 28 },
  introIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  introTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, marginBottom: 7 },
  introText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, opacity: 0.78 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3, marginBottom: 9 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, fontFamily: 'Inter_500Medium', fontSize: 16, marginBottom: 11 },
  descriptionInput: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  speechPreference: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 12 },
  speechPreferenceText: { flex: 1, gap: 3 },
  speechPreferenceTitle: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  speechPreferenceHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 },
  categoryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3, marginTop: 9, marginBottom: 9 },
  categorySuggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 3 },
  categorySuggestion: { borderRadius: 16, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  categorySuggestionText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 9 },
  stepCount: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  stepComposer: { borderWidth: 1, borderRadius: 15, padding: 8, marginBottom: 10 },
  stepComposerTop: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 0 },
  stepInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  addStepButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepDescriptionLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, marginLeft: 8, marginTop: 4, marginBottom: 7 },
  detailSpeechRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginHorizontal: 8, marginBottom: 7 },
  detailSpeechLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  stepDescriptionInput: { minHeight: 72, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginHorizontal: 6, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  additionalDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  additionalDetailInput: { flex: 1, marginHorizontal: 6 },
  removeDetailButton: { width: 34, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addDetailButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 4, marginLeft: 8, paddingHorizontal: 4 },
  addDetailText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  durationComposer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 4, paddingTop: 5 },
  durationLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  timeInputs: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { width: 35, height: 30, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12, padding: 0 },
  timeColon: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginHorizontal: 3 },
  timeHint: { fontFamily: 'Inter_400Regular', fontSize: 9, marginLeft: 6 },
  stepRow: { minHeight: 82, borderWidth: 1, borderRadius: 15, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  number: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numberText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  stepCopy: { flex: 1 },
  stepTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  stepDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  stepDuration: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  visibilityToggle: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  visibilityText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  stepActions: { flexDirection: 'row', marginLeft: 4 },
  stepActionButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  cancelEdit: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 8 },
  cancelEditText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 7 },
  pressed: { opacity: 0.72 },
});