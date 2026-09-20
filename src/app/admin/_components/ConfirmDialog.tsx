"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/i18n-context";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  variant?: "danger" | "default";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  onConfirm,
  confirmLabel,
  variant = "default",
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={variant === "danger" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {confirmLabel ?? t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
