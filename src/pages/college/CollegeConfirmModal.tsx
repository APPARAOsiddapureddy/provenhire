import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

export default function CollegeConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "No",
  loading = false,
  variant = "default",
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: "default" | "destructive";
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const destructive = variant === "destructive";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!loading) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div
            className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${
              destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}
          >
            {destructive ? (
              <AlertTriangle className="h-6 w-6" aria-hidden />
            ) : (
              <RotateCcw className="h-6 w-6" aria-hidden />
            )}
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button
            variant="outline"
            className="sm:min-w-24"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="sm:min-w-24"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
