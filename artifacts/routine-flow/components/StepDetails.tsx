import React from 'react';
import { Linking, Platform, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
import { splitStepDetails } from '@/lib/stepDetailLinks';
import { sanitizeStepDetailHtml } from '@/lib/stepDetailHtml';

export function StepDetails({
  details,
  style,
  linkColor,
  numberOfLines,
  detailHtml,
  backgroundColor,
}: {
  details: string | string[];
  style: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
  detailHtml?: string[];
  backgroundColor: string;
}) {
  const [openError, setOpenError] = React.useState(false);
  const detailEntries = (Array.isArray(details) ? details : [details])
    .map((detail, index) => ({ detail, index }))
    .filter(({ detail, index }) => detail.trim().length > 0 || Boolean(detailHtml?.[index]));

  return (
    <>
      {detailEntries.map(({ detail, index }) => {
        const html = detailHtml?.[index];
        if (html && Platform.OS !== 'web') {
          return (
            <RichEditor
              key={`html-${index}`}
              initialContentHTML={sanitizeStepDetailHtml(html)}
              disabled
              initialHeight={96}
              style={[styles.richPreview, StyleSheet.flatten(style) as object]}
              editorStyle={{
                backgroundColor,
                color: String(StyleSheet.flatten(style)?.color ?? linkColor),
                contentCSSText: `font-size:${StyleSheet.flatten(style)?.fontSize ?? 14}px;line-height:${StyleSheet.flatten(style)?.lineHeight ?? 20}px;padding:8px;`,
              }}
            />
          );
        }
        return (
          <Text key={`text-${index}`} style={style} numberOfLines={numberOfLines}>
            {splitStepDetails(detail).map((segment, segmentIndex) =>
              segment.url ? (
                <Text key={segmentIndex} accessibilityRole="link" accessibilityLabel={`Open ${segment.text}`}
                  style={{ color: linkColor, textDecorationLine: 'underline' }}
                  onPress={(event) => {
                    event.stopPropagation();
                    setOpenError(false);
                    void Linking.openURL(segment.url!).catch(() => setOpenError(true));
                  }}>{segment.text}</Text>
              ) : <React.Fragment key={segmentIndex}>{segment.text}</React.Fragment>,
            )}
          </Text>
        );
      })}
      {openError ? <Text accessibilityRole="alert" style={style}>Could not open the link. Please try again.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  richPreview: { width: '100%', minHeight: 96, maxHeight: 320, marginTop: 3 },
});
