import Svg, { Circle, Line, Path, Text as SvgText, type CircleProps, type LineProps, type PathProps, type SvgProps, type TextProps } from 'react-native-svg';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { categoryKey, listRoutineCategories } from '@/lib/routineCategories';
import {
  getPlaylistSkillIds,
  getRoutineSkillIds,
  getSkillRunAveragePoints,
  getUnambiguousRoutineTitles,
  type RoutineSkill,
  type SkillRatingSourceFilter,
} from '@/lib/skills';
import type { RoutinePlaylist } from '@/lib/playlists';
import type { Routine } from '@/types/routines';

const SvgElement = Svg as unknown as React.ComponentType<React.PropsWithChildren<SvgProps>>;
const SvgCircle = Circle as unknown as React.ComponentType<CircleProps>;
const SvgLine = Line as unknown as React.ComponentType<LineProps>;
const SvgPath = Path as unknown as React.ComponentType<PathProps>;
const SvgTextElement = SvgText as unknown as React.ComponentType<TextProps>;

const WIDTH = 340;
const HEIGHT = 184;
const LEFT = 29;
const RIGHT = 328;
const TOP = 10;
const BOTTOM = 128;

type ScopeKind = 'routine' | 'playlist' | 'category';
type ScopeOption = { id: string; label: string };

export function SkillScopeRatingChart({
  skills,
  routines,
  playlists,
  windowSize,
}: {
  skills: RoutineSkill[];
  routines: Routine[];
  playlists: RoutinePlaylist[];
  windowSize: number;
}) {
  const colors = useColors();
  const traceColors = [colors.primary, colors.success, colors.destructive, colors.accent, colors.sage, colors.inkSoft];
  const [scopeKind, setScopeKind] = React.useState<ScopeKind>('routine');
  const [selectedId, setSelectedId] = React.useState('');
  const [averageKind, setAverageKind] = React.useState<'cumulative' | 'rolling'>('cumulative');
  const [visibleTraceIds, setVisibleTraceIds] = React.useState<Set<string>>(() => new Set());

  const categories = React.useMemo(() => listRoutineCategories(routines), [routines]);
  const options: ScopeOption[] = scopeKind === 'routine'
    ? routines.map(item => ({ id: item.id, label: item.title }))
    : scopeKind === 'playlist'
      ? playlists.map(item => ({ id: item.id, label: item.title }))
      : categories.map(label => ({ id: categoryKey(label), label }));
  const selected = options.find(option => option.id === selectedId) ?? options[0];

  const skillIds = React.useMemo(() => {
    if (!selected) return [];
    if (scopeKind === 'routine') {
      const routine = routines.find(item => item.id === selected.id);
      return routine ? getRoutineSkillIds(routine) : [];
    }
    if (scopeKind === 'playlist') {
      const playlist = playlists.find(item => item.id === selected.id);
      return playlist ? getPlaylistSkillIds(playlist.routineIds, routines, playlist.skillIds) : [];
    }
    return [...new Set(routines
      .filter(item => categoryKey(item.category) === selected.id)
      .flatMap(getRoutineSkillIds))];
  }, [playlists, routines, scopeKind, selected]);
  const selectedSkills = skills.filter(skill => skillIds.includes(skill.id));
  const visibleSkills = selectedSkills.filter(skill => visibleTraceIds.has(skill.id));
  const traceColor = (skillId: string) => {
    const index = selectedSkills.findIndex(skill => skill.id === skillId);
    return traceColors[Math.max(index, 0) % traceColors.length];
  };
  const sourceFilter: SkillRatingSourceFilter | undefined = React.useMemo(() => {
    if (!selected) return undefined;
    const routineIds = scopeKind === 'routine'
      ? [selected.id]
      : scopeKind === 'playlist'
        ? playlists.find(item => item.id === selected.id)?.routineIds ?? []
        : routines.filter(item => categoryKey(item.category) === selected.id).map(item => item.id);
    const legacyRoutineTitles = getUnambiguousRoutineTitles(routines, routineIds);
    if (scopeKind === 'routine') return { kind: 'routine', id: selected.id, legacyRoutineTitles };
    if (scopeKind === 'playlist') return { kind: 'playlist', id: selected.id, legacyRoutineTitles };
    return { kind: 'category', routineIds, legacyRoutineTitles };
  }, [playlists, routines, scopeKind, selected]);
  const points = sourceFilter
    ? getSkillRunAveragePoints(selectedSkills, skillIds, windowSize, sourceFilter)
    : [];
  const chartPoints = points.slice(-30);

  const xAt = (index: number) => {
    const times = chartPoints.map(point => Date.parse(point.completedAt));
    const min = Math.min(...times);
    const max = Math.max(...times);
    return max === min
      ? LEFT + (chartPoints.length === 1 ? (RIGHT - LEFT) / 2 : ((RIGHT - LEFT) * index) / (chartPoints.length - 1))
      : LEFT + ((Date.parse(chartPoints[index].completedAt) - min) / (max - min)) * (RIGHT - LEFT);
  };
  const yAt = (value: number) => TOP + ((10 - value) / 9) * (BOTTOM - TOP);
  const averageAt = (point: (typeof chartPoints)[number]) =>
    averageKind === 'cumulative' ? point.cumulativeAverage : point.rollingAverage;
  const averageCoords = chartPoints.map((point, index) => ({ x: xAt(index), y: yAt(averageAt(point)) }));
  const averagePath = averageCoords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const areaPath = averageCoords.length
    ? `${averagePath} L ${averageCoords.at(-1)!.x} ${BOTTOM} L ${averageCoords[0].x} ${BOTTOM} Z`
    : '';
  const scopeLabel = scopeKind === 'category' ? `category “${selected?.label ?? ''}”` : `${scopeKind} “${selected?.label ?? ''}”`;
  const averageLabel = averageKind === 'cumulative' ? 'Cumulative average' : `Latest ${windowSize} runs average`;
  const dateTickIndexes = [...new Set([0, Math.floor((chartPoints.length - 1) / 2), chartPoints.length - 1])];
  const traceDescription = visibleSkills.map(skill => {
    const ratings = chartPoints
      .filter(point => point.skillRatings[skill.id] !== undefined)
      .map(point => `${point.skillRatings[skill.id]} out of 10 on ${new Date(point.completedAt).toLocaleDateString()}`)
      .join('; ');
    return ratings ? `${skill.name}: ${ratings}` : '';
  }).filter(Boolean).join('. ');

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.foreground }]}>Combined skill scores</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Only scores from this routine, playlist, or category are included. Older scores are matched by routine name only when it is unique; their playlist origin cannot be confirmed.
      </Text>
      <View style={styles.choiceRow}>
        {(['routine', 'playlist', 'category'] as const).map(kind => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityState={{ selected: scopeKind === kind }}
            testID={`skill-score-scope-${kind}`}
            onPress={() => { setScopeKind(kind); setSelectedId(''); }}
            style={[styles.choice, { backgroundColor: scopeKind === kind ? colors.primary : colors.secondary }]}
          >
            <Text style={[styles.choiceText, { color: scopeKind === kind ? colors.primaryForeground : colors.secondaryForeground }]}>
              {kind[0].toUpperCase() + kind.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {options.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
          {options.map(option => {
            const active = selected?.id === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${scopeKind} ${option.label} skill scores`}
                testID={`skill-score-option-${scopeKind}-${option.id}`}
                onPress={() => setSelectedId(option.id)}
                style={[styles.option, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : colors.background }]}
              >
                <Text numberOfLines={1} style={[styles.optionText, { color: active ? colors.foreground : colors.inkSoft }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No {scopeKind}s available yet.</Text>
      )}
      {selected ? (
        <>
          <View style={styles.choiceRow}>
            {(['cumulative', 'rolling'] as const).map(kind => {
              const active = averageKind === kind;
              return (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`skill-score-average-${kind}`}
                  onPress={() => setAverageKind(kind)}
                  style={[styles.choice, { backgroundColor: active ? colors.primary : colors.secondary }]}
                >
                  <Text style={[styles.choiceText, { color: active ? colors.primaryForeground : colors.secondaryForeground }]}>
                    {kind === 'cumulative' ? 'Cumulative' : `Rolling N = ${windowSize}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedSkills.length ? (
            <View style={styles.traceSection}>
              <View style={styles.traceHeader}>
                <Text style={[styles.traceTitle, { color: colors.foreground }]}>Individual skill lines</Text>
                {visibleSkills.length ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="skill-score-clear-traces"
                    onPress={() => setVisibleTraceIds(new Set())}
                    hitSlop={8}
                  >
                    <Text style={[styles.clearText, { color: colors.primary }]}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.traceOptions}>
                {selectedSkills.map(skill => {
                  const checked = visibleTraceIds.has(skill.id);
                  const color = traceColor(skill.id);
                  return (
                    <Pressable
                      key={skill.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${checked ? 'Hide' : 'Show'} ${skill.name} rating line`}
                      testID={`skill-score-trace-${skill.id}`}
                      onPress={() => setVisibleTraceIds(current => {
                        const next = new Set(current);
                        if (next.has(skill.id)) next.delete(skill.id);
                        else next.add(skill.id);
                        return next;
                      })}
                      style={[
                        styles.traceOption,
                        { borderColor: checked ? color : colors.border, backgroundColor: checked ? colors.sageSoft : colors.background },
                      ]}
                    >
                      <View style={[styles.traceCheck, { borderColor: checked ? color : colors.border, backgroundColor: checked ? color : 'transparent' }]}>
                        {checked ? <Text style={[styles.traceCheckmark, { color: colors.primaryForeground }]}>✓</Text> : null}
                      </View>
                      <View style={[styles.legendDot, { backgroundColor: checked ? color : colors.border }]} />
                      <Text numberOfLines={1} style={[styles.traceOptionText, { color: colors.foreground }]}>{skill.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={[styles.traceHint, { color: colors.mutedForeground }]}>
                {visibleSkills.length
                  ? `${visibleSkills.length} individual ${visibleSkills.length === 1 ? 'line' : 'lines'} shown. The combined average remains visible.`
                  : 'Select any skills to overlay their ratings. The combined average remains visible.'}
              </Text>
            </View>
          ) : null}
          {points.length ? (
            <>
              <Text style={[styles.summary, { color: colors.inkSoft }]}>
                {scopeLabel} · {points.length} {points.length === 1 ? 'rated run' : 'rated runs'} · {averageLabel}: {averageAt(points.at(-1)!).toFixed(1)} / 10
              </Text>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${averageLabel} for ${scopeLabel}. ${points.map(point => `${averageAt(point).toFixed(1)} out of 10 on ${new Date(point.completedAt).toLocaleDateString()}`).join('; ')}${traceDescription ? ` Individual skill ratings: ${traceDescription}` : ''}`}
                testID="skill-scope-rating-chart"
                style={styles.chart}
              >
                <Text style={[styles.axisCaption, { color: colors.mutedForeground }]}>Score / 10</Text>
                <SvgElement width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
                  {[1, 5, 10].map(value => {
                    const y = yAt(value);
                    return <React.Fragment key={value}>
                      <SvgLine x1={LEFT} y1={y} x2={RIGHT} y2={y} stroke={colors.border} strokeWidth={1} />
                      <SvgTextElement x={LEFT - 6} y={y + 4} textAnchor="end" fontSize={10} fill={colors.mutedForeground}>{value}</SvgTextElement>
                    </React.Fragment>;
                  })}
                  <SvgLine x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} stroke={colors.border} strokeWidth={1} />
                  <SvgLine x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} stroke={colors.border} strokeWidth={1} />
                  {averageKind === 'cumulative' && averageCoords.length > 1
                    ? <SvgPath d={areaPath} fill={colors.sageSoft} fillOpacity={0.55} stroke="none" />
                    : null}
                  {visibleSkills.map(skill => {
                    const values = chartPoints.flatMap((point, index) =>
                      point.skillRatings[skill.id] === undefined ? [] : [{ x: xAt(index), y: yAt(point.skillRatings[skill.id]), runId: point.runId }]);
                    if (!values.length) return null;
                    const path = values.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
                    const color = traceColor(skill.id);
                    return <React.Fragment key={skill.id}>
                      {values.length > 1 ? <SvgPath d={path} fill="none" stroke={color} strokeWidth={1.6} /> : null}
                      {values.map(point => <SvgCircle key={`${skill.id}-${point.runId}`} cx={point.x} cy={point.y} r={3} fill={color} />)}
                    </React.Fragment>;
                  })}
                  {averagePath ? <SvgPath d={averagePath} fill="none" stroke={colors.primary} strokeWidth={3} /> : null}
                  {averageCoords.map((point, index) => <SvgCircle key={chartPoints[index].runId} cx={point.x} cy={point.y} r={4} fill={colors.primary} />)}
                  {dateTickIndexes.map((index, tickIndex) => (
                    <SvgTextElement
                      key={`date-${index}`}
                      x={xAt(index)}
                      y={BOTTOM + 17}
                      textAnchor={tickIndex === 0 ? 'start' : tickIndex === dateTickIndexes.length - 1 ? 'end' : 'middle'}
                      fontSize={10}
                      fill={colors.mutedForeground}
                    >
                      {new Date(chartPoints[index].completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                    </SvgTextElement>
                  ))}
                  <SvgTextElement x={(LEFT + RIGHT) / 2} y={HEIGHT - 3} textAnchor="middle" fontSize={10} fill={colors.mutedForeground}>Run date</SvgTextElement>
                </SvgElement>
              </View>
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendText, { color: colors.inkSoft }]}>{averageLabel}</Text></View>
                {visibleSkills.map(skill => (
                  <View key={skill.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: traceColor(skill.id) }]} />
                    <Text style={[styles.legendText, { color: colors.inkSoft }]}>{skill.name}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              {selectedSkills.length ? 'No ratings have been recorded for these skills yet.' : 'This selection has no linked skills.'}
            </Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
  heading: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 5 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 9 },
  choice: { minHeight: 34, paddingHorizontal: 11, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  optionRow: { gap: 7, paddingBottom: 8 },
  option: { maxWidth: 190, minHeight: 33, paddingHorizontal: 10, borderWidth: 1, borderRadius: 11, justifyContent: 'center' },
  optionText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  traceSection: { marginTop: 4, marginBottom: 4 },
  traceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  traceTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  clearText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  traceOptions: { gap: 6, paddingBottom: 5 },
  traceOption: { minHeight: 34, maxWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8 },
  traceOptionText: { fontFamily: 'Inter_500Medium', fontSize: 11, flexShrink: 1 },
  traceCheck: { width: 15, height: 15, borderWidth: 1.3, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  traceCheckmark: { fontSize: 10, lineHeight: 12 },
  traceHint: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 2 },
  summary: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 6 },
  chart: { width: '100%', marginTop: 6 },
  axisCaption: { fontFamily: 'Inter_500Medium', fontSize: 10, marginLeft: 30 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, marginTop: -5 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  empty: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 6 },
});
