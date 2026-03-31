// apps/web/src/components/ui/collapsible.tsx
// Minimal headless collapsible implementation

'use client';

import React, { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

interface CollapsibleContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const CollapsibleContext = createContext<CollapsibleContextValue>({
  open: false,
  setOpen: () => {},
});

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}

export const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  ({ children, open: controlledOpen, onOpenChange, defaultOpen = false, className, ...props }, ref) => {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);

    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
      const next = typeof value === 'function' ? value(open) : value;
      setInternalOpen(next);
      onOpenChange?.(next);
    };

    return (
      <CollapsibleContext.Provider value={{ open, setOpen }}>
        <div ref={ref} className={cn(className)} {...props}>
          {children}
        </div>
      </CollapsibleContext.Provider>
    );
  }
);
Collapsible.displayName = 'Collapsible';

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ children, className, onClick, ...props }, ref) => {
    const { open, setOpen } = useContext(CollapsibleContext);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      setOpen((prev) => !prev);
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        type="button"
        aria-expanded={open}
        onClick={handleClick}
        className={cn(className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ children, className, ...props }, ref) => {
    const { open } = useContext(CollapsibleContext);

    if (!open) return null;

    return (
      <div ref={ref} className={cn(className)} {...props}>
        {children}
      </div>
    );
  }
);
CollapsibleContent.displayName = 'CollapsibleContent';
