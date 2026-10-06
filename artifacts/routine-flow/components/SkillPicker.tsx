import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSkills } from '@/context/SkillContext';

type SkillPickerProps = {
  selectedIds?: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  testIDPrefix?: string;
  label?: string;
};

export function SkillPicker({
  selectedIds = [],
  onChange,
  disabled = false,
  testIDPrefix = 'skill-picker',
  label = 'Skills (optional)',
}: SkillPickerProps) {
  const colors = useColors();
  const { skills, loading, error } = useSkills();
  const available = new Set(skills.map(skill => skill.id));
  const selected = new Set(selectedIds.filter(id => available.has(id)));

  function toggle(id: string) {
    const next = skills.filter(skill => skill.id === id ? !selected.has(id) : selected.has(skill.id)).map(skill => skill.id);
    onChange(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={[styles.label, { color: colors.inkSoft }]}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage skills"
          testID={`${testIDPrefix}-manage`}
          onPress={() => router.push('/(tabs)/skills')}
          style={({ pressed }) => [styles.manage, pressed && styles.pressed]}
        >
          <Text style={[styles.manageText, { color: colors.primary }]}>Manage</Text>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
        </Pressable>
      </View>
      {loading ? <ActivityIndicator size="small" color={colors.primary} style={styles.loader} /> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.note, { color: colors.destructive }]}>{error}</Text> : null}
      {!loading && !error && skills.length === 0 ? (
        <Text style={[styles.note, { color: colors.mutedForeground }]}>Create a skill to assign it here.</Text>
      ) : null}
      {!loading && !error && skills.length > 0 ? (
        <View style={styles.options}>
          {skills.map(skill => {
            const isSelected = selected.has(skill.id);
            return (
              <Pressable
                key={skill.id}
                accessibilityRole="button"
                accessibilityLabel={`${isSelected ? 'Remove' : 'Assign'} skill ${skill.name}`}
                accessibilityState={{ selected: isSelected, disabled }}
                testID={`${testIDPrefix}-${skill.id}`}
                disabled={disabled}
                onPress={() => toggle(skill.id)}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: isSelected ? colors.primary : colors.card, borderColor: isSelected ? colors.primary : colors.border },
                  pressed && styles.pressed,
                ]}
              >
                {isSelected ? <Ionicons name="checkmark" size={14} color={colors.primaryForeground} /> : null}
                <Text style={[styles.optionText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>{skill.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function SkillTagList({ skillIds, dark = false }: { skillIds?: string[]; dark?: boolean }) {
  const colors = useColors();
  const { skills } = useSkills();
  if (!skillIds?.length) return null;
  const names = skillIds
    .map(id => skills.find(skill => skill.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (!names.length) return null;
  return (
    <View style={styles.tags}>
      {names.map((name, index) => (
        <View key={`${name}-${index}`} style={[styles.tag, { backgroundColor: dark ? colors.heroForeground + '22' : colors.secondary }]}>
          <Text style={[styles.tagText, { color: dark ? colors.heroForeground : colors.inkSoft }]}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3 },
  manage: { minHeight: 32, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  manageText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  loader: { alignSelf: 'flex-start', paddingVertical: 6 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 2 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1 },
  optionText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  tag: { minHeight: 24, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12 },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  pressed: { opacity: 0.72 },
});
