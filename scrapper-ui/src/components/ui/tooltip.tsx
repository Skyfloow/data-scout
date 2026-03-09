import * as React from 'react';
import { Tooltip as AntTooltip } from 'antd';

interface TooltipContextValue {
  content: React.ReactNode;
  setContent: (content: React.ReactNode) => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [content, setContent] = React.useState<React.ReactNode>(null);
  return <TooltipContext.Provider value={{ content, setContent }}>{children}</TooltipContext.Provider>;
}

export function TooltipTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) return <>{children}</>;

  if (asChild && React.isValidElement(children)) {
    return <AntTooltip title={ctx.content}>{children}</AntTooltip>;
  }

  return <AntTooltip title={ctx.content}><span>{children}</span></AntTooltip>;
}

export const TooltipContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ children }, _ref) => {
  const ctx = React.useContext(TooltipContext);

  React.useEffect(() => {
    ctx?.setContent(children);
    return () => ctx?.setContent(null);
  }, [ctx, children]);

  return null;
});

TooltipContent.displayName = 'TooltipContent';
