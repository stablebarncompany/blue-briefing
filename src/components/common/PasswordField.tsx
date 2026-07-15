import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { FormField, type FormFieldProps } from '@/components/common/FormField';
import { spacing } from '@/theme';

export type PasswordFieldProps = Omit<FormFieldProps, 'secureTextEntry' | 'right'> & {
  label?: string;
};

export function PasswordField({ label = 'Password', ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <FormField
        label={label}
        secureTextEntry={!visible}
        textContentType="password"
        autoComplete="password"
        {...rest}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((value) => !value)}
        style={styles.toggle}>
        <AppText variant="caption" color="primary">
          {visible ? 'Hide password' : 'Show password'}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
});
