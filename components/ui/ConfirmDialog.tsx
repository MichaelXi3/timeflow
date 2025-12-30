'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  secondaryText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm: () => void;
  onSecondary?: () => void;
  onCancel?: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm',
  secondaryText,
  cancelText = 'Cancel',
  showCancel = true,
  onConfirm,
  onSecondary,
  onCancel,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleSecondary = () => {
    onSecondary?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 bg-black z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild aria-describedby={description ? undefined : undefined}>
          <motion.div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-2xl z-50 p-6"
            style={{ background: 'var(--card)' }}
            initial={{ opacity: 0, scale: 0.95, y: '-48%', x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, y: '-48%', x: '-50%' }}
            transition={{ duration: 0.2 }}
          >
            <Dialog.Title
              className="text-lg font-semibold mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              {title}
            </Dialog.Title>

            {description && (
              <Dialog.Description
                className="text-sm mb-6"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {description}
              </Dialog.Description>
            )}

            <div className="flex gap-3 justify-end items-center">
              {showCancel && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all mr-auto"
                  style={{
                    color: 'var(--muted-foreground)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--foreground)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--muted-foreground)';
                  }}
                >
                  {cancelText}
                </button>
              )}
              
              {secondaryText && (
                <button
                  onClick={handleSecondary}
                  className="px-5 py-2.5 text-sm font-medium rounded-xl transition-all"
                  style={{
                    border: '1px solid var(--border)',
                    color: '#ef4444', // Danger color for "Don't Save"
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#fef2f2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {secondaryText}
                </button>
              )}

              <button
                onClick={handleConfirm}
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, var(--primary) 0%, #5B9DD8 100%)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
