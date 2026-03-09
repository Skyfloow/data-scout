import * as React from 'react';
import { Input as AntInput } from 'antd';

export const Input = React.forwardRef<any, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'large' | 'middle' | 'small' }>(
  ({ className, type, size, ...props }, ref) => {
    return <AntInput ref={ref} className={className} {...props} />;
  }
);
Input.displayName = 'Input';
