import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { actions, RichEditor, RichToolbar } from 'react-native-pell-rich-editor';
import { useColors } from '@/hooks/useColors';

export function detailHtmlToText(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeStepDetailHtml(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

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
  function open() {
    setDraftHtml(html ? sanitizeStepDetailHtml(html) : `<p>${escapeHtml(value)}</p>`);
    setWebText(value);
    setVisible(true);
  }
  function save() {
    const nextHtml = Platform.OS === 'web' ? `<p>${escapeHtml(webText)}</p>` : draftHtml;
    onSave(detailHtmlToText(nextHtml), nextHtml);
    setVisible(false);
  }
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Expand rich text editor for ${label}`}
        disabled={disabled} onPress={open} style={[styles.open, { borderColor: colors.border }]}>
        <Ionicons name="expand-outline" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 12 }}>Expand editor · Format</Text>
      </Pressable>
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: 48 }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Save formatted detail" onPress={save}
              style={[styles.done, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>Done</Text></Pressable>
          </View>
          {Platform.OS === 'web' ? (
            <TextInput multiline value={webText} onChangeText={setWebText} style={[styles.webInput, { color: colors.foreground, borderColor: colors.border }]} />
          ) : (
            <>
              <RichToolbar editor={editor} actions={[
                actions.setBold, actions.setItalic, actions.setUnderline, actions.setStrikethrough,
                actions.heading1, actions.heading2, actions.heading3, actions.insertBulletsList, actions.insertOrderedList,
                actions.alignLeft, actions.alignCenter, actions.alignRight, actions.foreColor, actions.hiliteColor,
                actions.fontSize, actions.insertLink, actions.removeFormat, actions.blockquote, actions.undo, actions.redo,
              ]} />
              <RichEditor ref={editor} initialContentHTML={draftHtml} onChange={setDraftHtml}
                placeholder="Write step instructions…" style={styles.editor}
                editorStyle={{ backgroundColor: colors.background, color: colors.foreground, placeholderColor: colors.mutedForeground, contentCSSText: 'font-size:16px;line-height:1.5;padding:12px;' }} />
            </>
          )}
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
  done: { minHeight: 40, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editor: { flex: 1, borderWidth: 1, borderColor: '#aaa', borderRadius: 12 },
  webInput: { flex: 1, textAlignVertical: 'top', fontSize: 16, borderWidth: 1, borderRadius: 12, padding: 12 },
});
