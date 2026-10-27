import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ExpandableRichDetailEditor } from '@/components/ExpandableRichDetailEditor';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { StepDetails } from '@/components/StepDetails';
import { useColors } from '@/hooks/useColors';
import { detailHtmlToText, sanitizeStepDetailHtml } from '@/lib/stepDetailHtml';

export function RunReflectionPrompt({
  visible,
  sourceTitle,
  templateHtml,
  initialResponseHtml,
  onSkip,
  onSave,
}: {
  visible: boolean;
  sourceTitle: string;
  templateHtml: string;
  initialResponseHtml?: string;
  onSkip: () => void;
  onSave: (responseHtml: string) => Promise<void>;
}) {
  const colors = useColors();
  const [responseHtml, setResponseHtml] = React.useState(initialResponseHtml ?? '');
  const [responseText, setResponseText] = React.useState(
    initialResponseHtml ? detailHtmlToText(initialResponseHtml) : '',
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);

  React.useEffect(() => {
    if (!visible) return;
    setResponseHtml(initialResponseHtml ?? '');
    setResponseText(initialResponseHtml ? detailHtmlToText(initialResponseHtml) : '');
    setError('');
  }, [visible, initialResponseHtml]);

  async function save() {
    if (lock.current) return;
    const safeHtml = sanitizeStepDetailHtml(responseHtml);
    if (!detailHtmlToText(safeHtml).trim()) {
      setError('Add a reflection before saving, or come back to it later.');
      return;
    }
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(safeHtml);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this reflection. Please try again.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <KeyboardAwareScrollViewCompat
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bottomOffset={70}
        >
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name="create-outline" size={19} color={colors.success} />
            </View>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: colors.foreground }]}>Run reflection</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>{sourceTitle}</Text>
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Use the prompt below to reflect on this run. Your response is saved separately from skill ratings and notes.
          </Text>
          {templateHtml ? (
            <View style={[styles.template, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.templateLabel, { color: colors.inkSoft }]}>Your prompt</Text>
              <StepDetails details={detailHtmlToText(templateHtml)} detailHtml={[sanitizeStepDetailHtml(templateHtml)]}
                style={{ color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 }}
                linkColor={colors.primary} backgroundColor={colors.card} />
            </View>
          ) : null}
          <Text style={[styles.responseLabel, { color: colors.inkSoft }]}>Your response</Text>
          <ExpandableRichDetailEditor
            label="Run reflection"
            value={responseText}
            html={responseHtml}
            disabled={saving}
            onSave={(text, html) => {
              setResponseText(text);
              setResponseHtml(sanitizeStepDetailHtml(html));
              setError('');
            }}
          />
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Skip reflection for now"
              testID="skip-run-reflection" disabled={saving} onPress={onSkip} style={styles.skip}>
              <Text style={[styles.skipText, { color: colors.inkSoft }]}>Later</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Save run reflection"
              testID="save-run-reflection" disabled={saving}
              onPress={() => void save()}
              style={[styles.save, { backgroundColor: saving ? colors.secondary : colors.primary }]}>
              {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
              <Text style={[styles.saveText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>
                {saving ? 'Saving…' : 'Save reflection'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#14191dcc' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 13 },
  template: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  templateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  responseLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 18 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18 },
  skip: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 10 },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  save: { minHeight: 46, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
