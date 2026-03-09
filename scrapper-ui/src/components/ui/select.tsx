import * as React from 'react';
import { Select as AntSelect } from 'antd';

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

interface SelectTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

interface SelectContentProps {
  children?: React.ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const SelectTrigger = (_props: SelectTriggerProps) => null;
const SelectContent = (_props: SelectContentProps) => null;
const SelectGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SelectLabel = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SelectSeparator = () => null;
const SelectValue = (_props: SelectValueProps) => null;
const SelectItem = (_props: SelectItemProps) => null;

function isType<P>(node: React.ReactNode, component: React.ComponentType<P>) {
  return React.isValidElement(node) && node.type === component;
}

function extractPlaceholder(triggerElement: React.ReactElement<SelectTriggerProps> | null) {
  if (!triggerElement?.props.children) return undefined;
  const children = React.Children.toArray(triggerElement.props.children);
  for (const child of children) {
    if (React.isValidElement<SelectValueProps>(child) && child.type === SelectValue) {
      return child.props.placeholder;
    }
  }
  return undefined;
}

function extractOptions(contentElement: React.ReactElement<SelectContentProps> | null) {
  if (!contentElement?.props.children) return [];
  const children = React.Children.toArray(contentElement.props.children);
  const options: Array<{ value: string; label: React.ReactNode }> = [];

  for (const child of children) {
    if (React.isValidElement<SelectItemProps>(child) && child.type === SelectItem) {
      options.push({ value: child.props.value, label: child.props.children });
      continue;
    }

    if (React.isValidElement<{children: React.ReactNode}>(child) && child.type === SelectGroup) {
      const nested = React.Children.toArray(child.props.children);
      for (const nestedChild of nested) {
        if (React.isValidElement<SelectItemProps>(nestedChild) && nestedChild.type === SelectItem) {
          options.push({ value: nestedChild.props.value, label: nestedChild.props.children });
        }
      }
    }
  }

  return options;
}

const Select = ({ value, onValueChange, disabled, children }: SelectProps) => {
  const childArray = React.Children.toArray(children);

  const trigger = childArray.find((child) => isType(child, SelectTrigger)) as React.ReactElement<SelectTriggerProps> | undefined;
  const content = childArray.find((child) => isType(child, SelectContent)) as React.ReactElement<SelectContentProps> | undefined;

  const placeholder = extractPlaceholder(trigger || null);
  const options = extractOptions(content || null);

  return (
    <AntSelect
      value={value}
      onChange={onValueChange}
      disabled={disabled}
      placeholder={placeholder}
      options={options}
      style={trigger?.props.style}
      className={trigger?.props.className}
      popupMatchSelectWidth={false}
      allowClear={false}
    />
  );
};

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
