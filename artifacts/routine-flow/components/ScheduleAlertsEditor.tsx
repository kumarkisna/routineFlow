import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { formatAlertOffset, MAX_SCHEDULE_ALERTS, validateAlertOffsets } from '@/lib/scheduleAlerts';
import { formatLocalDateTime } from '@/lib/localDateTime';

export type AlertUnit = 'minutes' | 'hours' | 'days';
export type AlertRow = { key: number; value: string; unit: AlertUnit };
const MULT: Record<AlertUnit, number> = { minutes: 1, hours: 60, days: 1440 };
const UNITS: AlertUnit[] = ['minutes', 'hours', 'days'];
let seq = 0;

export function newAlertRow(value = '', unit: AlertUnit = 'minutes'): AlertRow {
  return { key: ++seq, value, unit };
}

export function offsetsToRows(offsets: number[]): AlertRow[] {
  return offsets.map((m) => {
    const unit: AlertUnit = m > 0 && m % 1440 === 0 ? 'days' : m > 0 && m % 60 === 0 ? 'hours' : 'minutes';
    return newAlertRow(String(m / MULT[unit]), unit);
  });
}

/** Returns offsets in minutes, or throws a user-facing Error. */
export function rowsToOffsets(rows: AlertRow[]): number[] {
  const out = rows.map((r) => {
    const v = r.value.trim();
    if (!/^\d{1,9}$/.test(v)) throw new Error('Enter a valid lead time in whole numbers for every alert. Use 0 for the scheduled start time.');
    return Number(v) * MULT[r.unit];
  });
  validateAlertOffsets(out);
  return out;
}

function previewFor(row: AlertRow, at: Date | null): string {
  const v = row.value.trim();
  if (!/^\d{1,9}$/.test(v)) return 'Enter a whole number';
  const mins = Number(v) * MULT[row.unit];
  if (!Number.isSafeInteger(mins * 60000)) return 'Lead time is too large';
  if (!at || Number.isNaN(at.getTime())) return `${formatAlertOffset(mins)}: set a valid date and time`;
  const d = new Date(at.getTime() - mins * 60000);
  if (Number.isNaN(d.getTime())) return 'Invalid time';
  const when = formatLocalDateTime(d, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${formatAlertOffset(mins)}: ${when}${d.getTime() <= Date.now() ? ' (already passed)' : ''}`;
}

export function ScheduleAlertsEditor({ rows, onChange, disabled, scheduledAt, isWeb, reminderOn }: {
  rows: AlertRow[]; onChange: (r: AlertRow[]) => void; disabled?: boolean; scheduledAt: Date | null; isWeb: boolean; reminderOn: boolean;
}) {
  const colors = useColors();
  const atMax = rows.length >= MAX_SCHEDULE_ALERTS;
  const patch = (key: number, p: Partial<AlertRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Alerts</Text>
        <Text testID="schedule-alert-count" accessibilityLiveRegion="polite" style={[styles.count, { color: atMax ? colors.destructive : colors.mutedForeground }]}>
          {rows.length} of {MAX_SCHEDULE_ALERTS} alerts{atMax ? ' (maximum)' : ''}
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Each alert fires this long before the start. Use 0 for the start time. Up to {MAX_SCHEDULE_ALERTS} per appointment.
        {isWeb ? ' Your lead times are saved here, but alerts are delivered only by the phone app with notification permission enabled.' : !reminderOn ? ' Turn on Phone reminder to deliver them.' : ''}
      </Text>
      {rows.map((r, i) => (
        <View key={r.key} style={styles.row}>
          <View style={styles.line}>
            <TextInput accessibilityLabel={`Alert ${i + 1} lead time`} testID={`schedule-alert-value-${i}`} value={r.value} editable={!disabled}
              maxLength={9} placeholder="0" placeholderTextColor={colors.mutedForeground} autoCorrect={false} autoCapitalize="none"
              keyboardType="number-pad" onChangeText={(t) => patch(r.key, { value: t })}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            <View style={styles.units}>
              {UNITS.map((u) => {
                const sel = r.unit === u;
                return (
                  <Pressable key={u} accessibilityRole="button" accessibilityLabel={`Alert ${i + 1} unit ${u}`} accessibilityState={{ selected: sel, disabled: !!disabled }}
                    testID={`schedule-alert-unit-${i}-${u}`} disabled={disabled} onPress={() => patch(r.key, { unit: u })}
                    style={[styles.unit, { backgroundColor: sel ? colors.primary : colors.background, borderColor: sel ? colors.primary : colors.border }]}>
                    <Text style={[styles.unitText, { color: sel ? colors.primaryForeground : colors.inkSoft }]}>{u}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove alert ${i + 1}`} testID={`schedule-remove-alert-${i}`}
              disabled={disabled || rows.length <= 1} accessibilityState={{ disabled: !!disabled || rows.length <= 1 }}
              onPress={() => onChange(rows.filter((x) => x.key !== r.key))} style={[styles.remove, rows.length <= 1 && { opacity: 0.35 }]}>
              <Ionicons name="remove-circle-outline" size={24} color={colors.destructive} />
            </Pressable>
          </View>
          <Text testID={`schedule-alert-preview-${i}`} style={[styles.preview, { color: colors.mutedForeground }]}>{previewFor(r, scheduledAt)}</Text>
        </View>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel={atMax ? `Maximum of ${MAX_SCHEDULE_ALERTS} alerts reached` : 'Add alert'}
        accessibilityState={{ disabled: !!disabled || atMax }} testID="schedule-add-alert" disabled={disabled || atMax}
        onPress={() => onChange([...rows, newAlertRow('', 'minutes')])}
        style={[styles.add, { borderColor: colors.primary }, (disabled || atMax) && { opacity: 0.4 }]}>
        <Ionicons name="add" size={18} color={colors.primary} />
        <Text style={[styles.unitText, { color: colors.primary, fontSize: 14 }]}>Add alert</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  count: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  row: { marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { width: 62, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, fontFamily: 'Inter_500Medium', fontSize: 15, textAlign: 'center' },
  units: { flex: 1, flexDirection: 'row', gap: 4 },
  unit: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  remove: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  preview: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4, marginLeft: 2 },
  add: { minHeight: 44, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
