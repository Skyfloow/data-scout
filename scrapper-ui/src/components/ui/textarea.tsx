import * as React from 'react';
import { Input } from 'antd';

const { TextArea } = Input;

export const Textarea = React.forwardRef<any, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return <TextArea ref={ref} className={className} {...props} />;
  }
);
Textarea.displayName = 'Textarea';
