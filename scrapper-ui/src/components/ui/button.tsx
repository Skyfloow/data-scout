import * as React from 'react';
import { Button as AntButton, type ButtonProps as AntButtonProps } from 'antd';

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'size' | 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  htmlType?: 'button' | 'submit' | 'reset';
}

function mapType(variant: ButtonVariant): AntButtonProps['type'] {
  if (variant === 'ghost') return 'text';
  if (variant === 'outline') return 'default';
  if (variant === 'secondary') return 'dashed';
  return 'primary';
}

function mapSize(size: ButtonSize): AntButtonProps['size'] {
  if (size === 'sm') return 'small';
  if (size === 'lg') return 'large';
  return 'middle';
}

export const Button = React.forwardRef<any, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading, disabled, children, style, ...props }, ref) => {
    const isDanger = variant === 'destructive';

    return (
      <AntButton
        ref={ref}
        className={className}
        type={mapType(variant)}
        size={mapSize(size)}
        danger={isDanger}
        ghost={false}
        loading={loading}
        disabled={disabled || loading}
        shape={size === 'icon' ? 'circle' : 'default'}
        style={size === 'icon' ? { width: 36, height: 36, ...style } : style}
        htmlType={props.htmlType}
        {...props}
      >
        {children}
      </AntButton>
    );
  }
);
Button.displayName = 'Button';
