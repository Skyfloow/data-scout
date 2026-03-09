import * as React from 'react';
import { Tabs as AntTabs } from 'antd';

interface TabsProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

interface TabsListProps {
  children: React.ReactNode;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
}

const TabsList = ({ children }: TabsListProps) => <>{children}</>;
const TabsTrigger = (_props: TabsTriggerProps) => null;
const TabsContent = ({ className, style, children }: TabsContentProps) => (
  <div className={className} style={style}>
    {children}
  </div>
);

function isType<P>(node: React.ReactNode, component: React.ComponentType<P>) {
  return React.isValidElement(node) && node.type === component;
}

export const Tabs = ({ value, onValueChange, children }: TabsProps) => {
  const allChildren = React.Children.toArray(children);
  const list = allChildren.find((child) => isType(child, TabsList)) as React.ReactElement<TabsListProps> | undefined;
  const contents = allChildren.filter((child) => isType(child, TabsContent)) as React.ReactElement<TabsContentProps>[];

  const triggers = list ? (React.Children.toArray(list.props.children).filter((child) => isType(child, TabsTrigger)) as React.ReactElement<TabsTriggerProps>[]) : [];

  const items = triggers.map((trigger) => {
    const content = contents.find((c) => c.props.value === trigger.props.value);

    return {
      key: trigger.props.value,
      label: trigger.props.children,
      children: content ? (
        <div className={content.props.className} style={content.props.style}>
          {content.props.children}
        </div>
      ) : null,
    };
  });

  return <AntTabs activeKey={value} onChange={onValueChange} items={items} />;
};

export { TabsList, TabsTrigger, TabsContent };
