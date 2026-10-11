import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { buildRoutinePdfHtml } from '@/lib/routinePrint';
import type { Routine } from '@/types/routines';

export function RoutinePdfExportButton({
  title,
  kind,
  routines,
  testID,
  buttonStyle,
  iconColor,
}: {
  title: string;
  kind: 'routine' | 'playlist';
  routines: (Routine | undefined)[];
  testID: string;
  buttonStyle?: StyleProp<ViewStyle>;
  iconColor?: string;
}) {
  const colors = useColors();
  const [visible, setVisible] = React.useState(false);
  const [includeNotes, setIncludeNotes] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);

  async function printPdf() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const html = buildRoutinePdfHtml({ title, kind, routines, includeNotes });
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined') throw new Error('Browser printing is unavailable.');
        const printWindow = window.open('', '_blank');
        if (!printWindow) throw new Error('Allow pop-ups in your browser to print this PDF.');
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onafterprint = () => printWindow.close();
        printWindow.focus();
        printWindow.print();
      } else {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${title} PDF`,
          });
        } else {
          await Print.printAsync({ html });
        }
      }
      setVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this PDF.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Print ${kind} ${title} as PDF`}
        testID={testID}
        onPress={() => { setError(''); setVisible(true); }}
        style={({ pressed }) => [styles.iconButton, buttonStyle, pressed && styles.pressed]}
      >
        <Ionicons name="print-outline" size={20} color={iconColor ?? colors.primary} />
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && setVisible(false)}>
        <View style={[styles.backdrop, { backgroundColor: `${colors.foreground}66` }]}>
          <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>Print {kind} PDF</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              The PDF includes the title, step order, and durations. When notes are included, web links get QR codes.
            </Text>
            <View style={[styles.option, { borderColor: colors.border }]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.foreground }]}>Include notes and step details</Text>
                <Text style={[styles.optionHint, { color: colors.mutedForeground }]}>Includes descriptions and additional details.</Text>
              </View>
              <Switch
                accessibilityLabel="Include notes and step details in PDF"
                testID="pdf-include-notes"
                value={includeNotes}
                onValueChange={setIncludeNotes}
                disabled={busy}
                trackColor={{ false: colors.border, true: colors.sage }}
                thumbColor={includeNotes ? colors.primary : colors.card}
              />
            </View>
            {error ? <Text accessibilityRole="alert" testID="routine-pdf-error" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setVisible(false)} style={styles.cancel}>
                <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" testID="confirm-routine-pdf" disabled={busy} onPress={() => void printPdf()}
                style={[styles.confirm, { backgroundColor: busy ? colors.secondary : colors.primary }]}>
                {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Ionicons name="print-outline" size={17} color={colors.primaryForeground} />}
                <Text style={[styles.actionText, { color: busy ? colors.mutedForeground : colors.primaryForeground }]}>{busy ? 'Preparing…' : 'Print / save PDF'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  backdrop: { flex: 1, padding: 20, justifyContent: 'center' },
  dialog: { borderWidth: 1, borderRadius: 20, padding: 18 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  optionCopy: { flex: 1 },
  optionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  optionHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17, marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 18 },
  cancel: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  confirm: { minHeight: 44, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
