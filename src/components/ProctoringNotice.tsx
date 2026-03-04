import { Monitor, MousePointerClick, Camera, Cpu } from "lucide-react";

const ProctoringNotice = () => (
  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm font-semibold text-foreground">Proctoring active during this test</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Monitor className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>Full-screen mode enforcement</span>
      </div>
      <div className="flex items-center gap-2">
        <MousePointerClick className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>Tab-switch detection</span>
      </div>
      <div className="flex items-center gap-2">
        <Camera className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>Webcam snapshot verification</span>
      </div>
      <div className="flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>AI proctoring technology</span>
      </div>
    </div>
  </div>
);

export default ProctoringNotice;
