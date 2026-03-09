import * as React from 'react';
import { Checkbox as AntCheckbox } from 'antd';

type CheckedState = boolean | 'indeterminate';

interface CheckboxProps extends Omit<React.ComponentProps<typeof AntCheckbox>, 'checked' | 'onChange'> {
  checked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
}

export const Checkbox = React.forwardRef<any, CheckboxProps>(({ checked, onCheckedChange, ...props }, ref) => {
  const isIndeterminate = checked === 'indeterminate';
  return (
    <AntCheckbox
      ref={ref}
      checked={checked === true}
      indeterminate={isIndeterminate}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  );
});

Checkbox.displayName = 'Checkbox';
