import * as React from 'react';
import { Divider } from 'antd';

export function Separator({ orientation = 'horizontal', style, ...props }: { orientation?: 'horizontal' | 'vertical' } & React.HTMLAttributes<HTMLDivElement>) {
  if (orientation === 'vertical') {
    return <Divider type="vertical" style={style} {...props} />;
  }
  return <Divider style={{ margin: '8px 0', ...style }} {...props} />;
}
