import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type WorkspaceConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: "default" | "destructive";
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export default function WorkspaceConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "No",
  loading = false,
  variant = "default",
  onOpenChange,
  onConfirm,
}: WorkspaceConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)] text-[var(--dash-text-primary)] shadow-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[var(--dash-text-primary)]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--dash-text-secondary)]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="border-[var(--dash-navy-border)] bg-transparent text-[var(--dash-text-primary)] hover:bg-white/10"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
