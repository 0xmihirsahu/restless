"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmClassName?: string;
  children?: ReactNode;
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "confirm",
  confirmClassName = "bg-destructive text-destructive-foreground",
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-background border border-border p-6 max-w-sm w-full space-y-4">
              <h3 className="text-base font-bold text-foreground font-display">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  cancel
                </button>
                <button
                  onClick={() => { onConfirm(); onClose(); }}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity ${confirmClassName}`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
