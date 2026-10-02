import { Platform, ScrollView, ScrollViewProps, StyleSheet } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'on-drag',
  style,
  mode = Platform.OS === 'android' ? 'layout' : 'insets',
  bottomOffset = 24,
  ...props
}: Props) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        style={[styles.viewport, style]}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      style={[styles.viewport, style]}
      mode={mode}
      bottomOffset={bottomOffset}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
});
