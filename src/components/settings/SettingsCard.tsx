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
    <Card className="settings-card">
      <CardHeader className="settings-card-header">
        <CardTitle className="text-lg text-white">{title}</CardTitle>
        {description && <CardDescription className="text-white/70">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="settings-card-content">
        {children}
        {onSave && (
          <Button
            className="dashboard-btn-gold mt-4 settings-card-save"
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
