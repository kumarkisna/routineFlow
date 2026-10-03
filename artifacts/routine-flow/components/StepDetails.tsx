import React from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { splitStepDetails } from '@/lib/stepDetailLinks';

export function StepDetails({
  details,
  style,
  linkColor,
  numberOfLines,
}: {
  details: string | string[];
  style: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
}) {
  const [openError, setOpenError] = React.useState(false);
  const detailText = (Array.isArray(details) ? details : [details])
    .filter((detail) => detail.trim().length > 0)
    .join('\n');

  return (
    <>
      <Text style={style} numberOfLines={numberOfLines}>
        {splitStepDetails(detailText).map((segment, index) =>
          segment.url ? (
            <Text
              key={index}
              accessibilityRole="link"
              accessibilityLabel={`Open ${segment.text}`}
              style={{ color: linkColor, textDecorationLine: 'underline' }}
              onPress={(event) => {
                event.stopPropagation();
                setOpenError(false);
                void Linking.openURL(segment.url!).catch(() => setOpenError(true));
              }}
            >
              {segment.text}
            </Text>
          ) : (
            <React.Fragment key={index}>{segment.text}</React.Fragment>
          ),
        )}
      </Text>
      {openError ? <Text accessibilityRole="alert" style={style}>Could not open the link. Please try again.</Text> : null}
    </>
  );
}