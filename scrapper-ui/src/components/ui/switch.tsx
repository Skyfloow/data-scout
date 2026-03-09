import * as React from 'react';
import { Switch as AntSwitch } from 'antd';

interface SwitchProps extends Omit<React.ComponentProps<typeof AntSwitch>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({ onCheckedChange, ...props }, ref) => (
  <AntSwitch ref={ref} onChange={onCheckedChange} {...props} />
));

Switch.displayName = 'Switch';
