import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Volume2, AlertTriangle } from "lucide-react";

interface SoundDetectedAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SoundDetectedAlert({ open, onOpenChange }: SoundDetectedAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20">
              <Volume2 className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Sound detected
              </AlertDialogTitle>
              <AlertDialogDescription>
                Unusual sound was detected during the test. Please ensure you are in a quiet environment.
                Continued disruptions may affect your assessment.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => onOpenChange(false)}>Acknowledged</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
