import * as React from 'react';
import { Tag } from 'antd';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
}

function mapColor(variant: NonNullable<BadgeProps['variant']>) {
  if (variant === 'success') return 'success';
  if (variant === 'warning') return 'warning';
  if (variant === 'destructive') return 'error';
  if (variant === 'secondary') return 'processing';
  if (variant === 'default') return 'blue';
  return undefined;
}

export function Badge({ className, variant = 'default', style, children, ...props }: BadgeProps) {
  const bordered = variant === 'outline';

  return (
    <Tag
      className={className}
      color={mapColor(variant)}
      bordered={bordered}
      style={{ marginInlineEnd: 0, ...style }}
      {...props}
    >
      {children}
    </Tag>
  );
}
