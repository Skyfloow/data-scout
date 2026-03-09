import * as React from 'react';
import { Modal } from 'antd';

interface DialogContextValue {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue>({ open: false });

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog = ({ open = false, onOpenChange, children }: DialogProps) => {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
};

const DialogTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DialogOverlay = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const DialogClose = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { hideClose?: boolean, width?: number | string }>(
  ({ children, hideClose, style, width = 800, ...props }, _ref) => {
    const { open, onOpenChange } = React.useContext(DialogContext);
    return (
      <Modal
        open={open}
        onCancel={() => onOpenChange?.(false)}
        footer={null}
        closable={!hideClose}
        destroyOnClose
        centered
        focusTriggerAfterClose={false}
        width={width}
        style={{ maxWidth: '95vw' }}
        styles={{ 
          mask: {
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)'
          },
          body: {
            padding: '24px 24px', 
            borderRadius: 8, 
            boxShadow: 'var(--box-shadow)',
          }
        }}
      >
        <div {...props} style={{ outline: 'none', ...style }}>{children}</div>
      </Modal>
    );
  }
);
DialogContent.displayName = 'DialogContent';

function DialogHeader({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div style={{ paddingBottom: 12 }} {...props} />;
}

function DialogFooter({ style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, ...style }} {...props} />;
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ style, ...props }, ref) => (
  <h3 ref={ref} style={{ margin: 0, fontSize: 18, ...style }} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ style, ...props }, ref) => (
  <p ref={ref} style={{ margin: '8px 0 0', opacity: 0.75, ...style }} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
