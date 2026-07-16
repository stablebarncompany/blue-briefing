import { StyleSheet, View } from 'react-native';

import { AppText, FormField } from '@/components/common';
import { spacing } from '@/theme';

export type CustomOptionFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  helperText?: string | null;
  required?: boolean;
};

export function CustomOptionField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  required = false,
}: CustomOptionFieldProps) {
  return (
    <View style={styles.wrap}>
      <FormField
        label={required ? `${label} (required)` : label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="words"
        error={error}
      />
      {helperText ? (
        <AppText variant="caption" color="textSubtle">
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
});
