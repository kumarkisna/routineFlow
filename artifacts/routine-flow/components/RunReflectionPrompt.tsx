import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ExpandableRichDetailEditor } from '@/components/ExpandableRichDetailEditor';
import { useColors } from '@/hooks/useColors';
import type { SkillRatingRun } from '@/lib/skills';

export function RunReflectionPrompt({
  visible, routineTitle, run, initialText, initialHtml, onSave, onSaved, onSkip,
}: {
  visible: boolean;
  routineTitle: string;
  run: SkillRatingRun;
  initialText?: string;
  initialHtml?: string;
  onSave: (text: string, html: string) => Promise<void>;
  onSaved: () => void;
  onSkip: () => void | Promise<void>;
}) {
  const colors = useColors();
  const [text, setText] = React.useState('');
  const [html, setHtml] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (visible) {
      setText(initialText ?? '');
      setHtml(initialHtml ?? '');
      setError('');
    }
  }, [visible, run.runId, initialText, initialHtml]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(text, html);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this run reflection.');
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSkip();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this run reflection for later.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => void skip()}>
      <View style={[styles.backdrop, { backgroundColor: `${colors.foreground}66` }]}>
        <KeyboardAwareScrollViewCompat
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={70}
        >
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name="create-outline" size={19} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Run reflection</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{routineTitle}</Text>
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Add or change this reflection for this run. It will not change the routine.
          </Text>
          <TextInput
            accessibilityLabel="Run reflection"
            testID="run-reflection-input"
            multiline
            editable={!saving}
            value={text}
            onChangeText={value => { setText(value); setHtml(''); }}
            placeholder="Write a reflection for this run…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          />
          <ExpandableRichDetailEditor
            label="Run reflection"
            value={text}
            html={html}
            disabled={saving}
            onSave={(nextText, nextHtml) => { setText(nextText); setHtml(nextHtml); }}
          />
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void skip()} style={styles.secondary}>
              <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Do this later</Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="save-run-reflection" disabled={saving} onPress={() => void save()}
              style={[styles.primary, { backgroundColor: saving ? colors.secondary : colors.primary }]}>
              {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
              <Text style={[styles.actionText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>
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
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  input: { minHeight: 110, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  primary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 15 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
