import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { getSkillRatingPoints, type RoutineSkill } from '@/lib/skills';

const CHART_WIDTH = 340;
const CHART_HEIGHT = 142;
const LEFT = 26;
const RIGHT = 328;
const TOP = 10;
const BOTTOM = 112;

export function SkillRatingChart({ skill, windowSize }: { skill: RoutineSkill; windowSize: number }) {
  const colors = useColors();
  const points = getSkillRatingPoints(skill, windowSize, 14);
  if (!points.length) return null;

  const times = points.map(point => Date.parse(point.ratedAt));
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const plotWidth = RIGHT - LEFT;
  const plotHeight = BOTTOM - TOP;
  const coordinates = points.map((point, index) => {
    const x = maxTime === minTime
      ? LEFT + (points.length === 1 ? plotWidth / 2 : (plotWidth * index) / (points.length - 1))
      : LEFT + ((Date.parse(point.ratedAt) - minTime) / (maxTime - minTime)) * plotWidth;
    return {
      x,
      ratingY: TOP + ((10 - point.rating) / 9) * plotHeight,
      averageY: TOP + ((10 - point.average) / 9) * plotHeight,
    };
  });
  const ratingPath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.ratingY}`).join(' ');
  const averagePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.averageY}`).join(' ');
  const startLabel = new Date(points[0].ratedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = new Date(points.at(-1)!.ratedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Rating history for ${skill.name}. ${points.map(point =>
        `${point.rating} out of 10 on ${new Date(point.ratedAt).toLocaleDateString()}, rolling average ${point.average.toFixed(1)}`,
      ).join('; ')}.`}
      testID={`skill-rating-chart-${skill.id}`}
      style={styles.container}
    >
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        {[1, 5, 10].map(value => {
          const y = TOP + ((10 - value) / 9) * plotHeight;
          return (
            <React.Fragment key={value}>
              <Line x1={LEFT} y1={y} x2={RIGHT} y2={y} stroke={colors.border} strokeWidth={1} />
              <SvgText x={LEFT - 6} y={y + 4} textAnchor="end" fontSize={10} fill={colors.mutedForeground}>{value}</SvgText>
            </React.Fragment>
          );
        })}
        <Path d={ratingPath} fill="none" stroke={colors.primary} strokeWidth={2} />
        <Path d={averagePath} fill="none" stroke={colors.success} strokeWidth={2.5} strokeDasharray="5 3" />
        {coordinates.map((point, index) => (
          <Circle key={`${points[index].id}-rating`} cx={point.x} cy={point.ratingY} r={3.6} fill={colors.primary} />
        ))}
        {coordinates.length === 1 ? (
          <Circle cx={coordinates[0].x} cy={coordinates[0].averageY} r={4.5} fill={colors.success} />
        ) : null}
        <SvgText x={LEFT} y={CHART_HEIGHT - 8} textAnchor="start" fontSize={10} fill={colors.mutedForeground}>{startLabel}</SvgText>
        <SvgText x={RIGHT} y={CHART_HEIGHT - 8} textAnchor="end" fontSize={10} fill={colors.mutedForeground}>{endLabel}</SvgText>
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Ratings</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, styles.dashedLegend, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Latest-{windowSize} average</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: -4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  dashedLegend: { opacity: 0.72 },
  legendText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
});
