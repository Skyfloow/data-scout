import * as React from 'react';
import { Card as AntCard } from 'antd';
import { cn } from '../../lib/utils';

export function Card({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AntCard
      className={cn('app-card', className)}
      style={style}
      styles={{ body: { padding: 0 } }}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-header', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('card-title', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('card-description', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-content', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-footer', className)} {...props} />;
}
