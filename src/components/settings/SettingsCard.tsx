import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SettingsCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
}

export function SettingsCard({ title, description, children, onSave, saving }: SettingsCardProps) {
  return (
    <Card className="border-[var(--dash-navy-border)] bg-white/5">
      <CardHeader>
        <CardTitle className="text-lg text-white">{title}</CardTitle>
        {description && <CardDescription className="text-white/70">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {onSave && (
          <Button
            className="dashboard-btn-gold mt-4"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
