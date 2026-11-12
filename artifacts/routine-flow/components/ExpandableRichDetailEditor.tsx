import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { actions, RichEditor, RichToolbar } from 'react-native-pell-rich-editor';
import { useColors } from '@/hooks/useColors';
import { sanitizeStepDetailHtml } from '@/lib/stepDetailHtml';
import { serializeStepDetailEditorSave } from '@/lib/stepDetailEditor';

export { detailHtmlToText, sanitizeStepDetailHtml } from '@/lib/stepDetailHtml';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

export function ExpandableRichDetailEditor({ label, value, html, disabled, onSave }: {
  label: string; value: string; html: string; disabled: boolean;
  onSave: (text: string, html: string) => void;
}) {
  const colors = useColors();
  const editor = useRef<RichEditor>(null);
  const [visible, setVisible] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const [webText, setWebText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const draftRef = useRef<{ sourceKey: string; html: string; text: string } | null>(null);

  function open() {
    const sourceKey = JSON.stringify([label, value, html]);
    const retained = draftRef.current?.sourceKey === sourceKey ? draftRef.current : null;
    const nextHtml = retained?.html ?? (html ? sanitizeStepDetailHtml(html) : `<p>${escapeHtml(value)}</p>`);
    const nextText = retained?.text ?? value;
    draftRef.current = { sourceKey, html: nextHtml, text: nextText };
    setDraftHtml(nextHtml);
    setWebText(nextText);
    setHasDraft(true);
    setVisible(true);
  }

  function keepDraftAndClose() {
    setVisible(false);
  }

  function discardDraft() {
    draftRef.current = null;
    setHasDraft(false);
    setVisible(false);
  }

  function save() {
    const saved = serializeStepDetailEditorSave(Platform.OS === 'web' ? 'web' : 'native', webText, draftHtml);
    onSave(saved.text, saved.html);
    draftRef.current = null;
    setHasDraft(false);
    setVisible(false);
  }

  function updateDraftHtml(nextHtml: string) {
    setDraftHtml(nextHtml);
    if (draftRef.current) draftRef.current = { ...draftRef.current, html: nextHtml };
  }

  function updateWebText(nextText: string) {
    setWebText(nextText);
    if (draftRef.current) draftRef.current = { ...draftRef.current, text: nextText };
  }

  return (
    <>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${hasDraft ? 'Continue editing draft for' : 'Expand rich text editor for'} ${label}`}
        disabled={disabled} onPress={open} style={[styles.open, { borderColor: colors.border }]}>
        <Ionicons name="expand-outline" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 12 }}>
          {hasDraft ? 'Continue editing draft' : 'Expand editor · Format'}
        </Text>
      </Pressable>
      <Modal visible={visible} animationType="slide" onRequestClose={keepDraftAndClose}>
        <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: 48 }]}>
          <View style={styles.header}>
            <Pressable testID="rich-detail-close-keep" accessibilityRole="button"
              accessibilityLabel="Close editor and keep draft" onPress={keepDraftAndClose} style={styles.close}>
              <Ionicons name="close" size={21} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
            <Pressable testID="rich-detail-discard-draft" accessibilityRole="button"
              accessibilityLabel={`Discard draft for ${label}`} onPress={discardDraft} style={styles.discard}>
              <Text style={[styles.discardText, { color: colors.destructive }]}>Discard</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Save formatted detail" onPress={save}
              style={[styles.done, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>Done</Text></Pressable>
          </View>
          {visible ? (Platform.OS === 'web' ? (
            <TextInput testID="rich-detail-web-input" accessibilityLabel={`Formatted content for ${label}`}
              multiline value={webText} onChangeText={updateWebText}
              style={[styles.webInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]} />
          ) : (
            <>
              <RichToolbar editor={editor} actions={[
                actions.setBold, actions.setItalic, actions.setUnderline, actions.setStrikethrough,
                actions.heading1, actions.heading2, actions.heading3, actions.insertBulletsList, actions.insertOrderedList,
                actions.alignLeft, actions.alignCenter, actions.alignRight, actions.foreColor, actions.hiliteColor,
                actions.fontSize, actions.insertLink, actions.removeFormat, actions.blockquote, actions.undo, actions.redo,
              ]} />
              <RichEditor ref={editor} initialContentHTML={draftHtml} onChange={updateDraftHtml}
                placeholder="Write step instructions…" style={styles.editor}
                editorStyle={{ backgroundColor: colors.input, color: colors.foreground, placeholderColor: colors.mutedForeground, contentCSSText: 'font-size:16px;line-height:1.5;padding:12px;' }} />
            </>
          )) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  open: { minHeight: 34, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginTop: 6 },
  modal: { flex: 1, paddingHorizontal: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 18 },
  close: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  discard: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  discardText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  done: { minHeight: 40, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editor: { flex: 1, borderWidth: 1, borderColor: '#aaa', borderRadius: 12 },
  webInput: { flex: 1, textAlignVertical: 'top', fontSize: 16, borderWidth: 1, borderRadius: 12, padding: 12 },
});
