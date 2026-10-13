import React from 'react';
import { Linking, Platform, Text, type StyleProp, type TextStyle } from 'react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
import { splitStepDetails } from '@/lib/stepDetailLinks';
import { sanitizeStepDetailHtml } from '@/components/ExpandableRichDetailEditor';

export function StepDetails({
  details,
  style,
  linkColor,
  numberOfLines,
  detailHtml,
}: {
  details: string | string[];
  style: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
  detailHtml?: string[];
}) {
  const [openError, setOpenError] = React.useState(false);
  const detailEntries = (Array.isArray(details) ? details : [details])
    .map((detail, index) => ({ detail, index }))
    .filter(({ detail }) => detail.trim().length > 0);

  return (
    <>
      {detailEntries.map(({ detail, index }) => {
        const html = detailHtml?.[index];
        if (html && Platform.OS !== 'web') {
          return <RichEditor key={`html-${index}`} initialContentHTML={sanitizeStepDetailHtml(html)} disabled
            initialHeight={80} style={{ height: 96, ...((style ?? {}) as object) }} />;
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