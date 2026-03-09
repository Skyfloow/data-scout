import * as React from 'react';
import { Alert as AntAlert } from 'antd';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'destructive';
}

function mapType(variant: NonNullable<AlertProps['variant']>) {
  if (variant === 'success') return 'success';
  if (variant === 'warning') return 'warning';
  if (variant === 'destructive') return 'error';
  if (variant === 'info') return 'info';
  return 'info';
}

export function Alert({ className, variant = 'default', children, style, ...props }: AlertProps) {
  return (
    <AntAlert
      className={className}
      type={mapType(variant)}
      showIcon
      message={children}
      style={style}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={className} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}
