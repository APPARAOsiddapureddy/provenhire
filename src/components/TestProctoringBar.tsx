import { Shield, Monitor, Eye, Camera, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TestProctoringBarProps {
  /** Optional tab switch count for display (e.g. 0/3) */
  tabSwitchCount?: number;
  maxTabSwitches?: number;
  /** When false, hide tab switch display (e.g. when tab_switch_detection flag is OFF) */
  showTabSwitch?: boolean;
}

/** Persistent proctoring bar during aptitude/DSA tests — makes users feel monitored to deter cheating. */
const TestProctoringBar = ({ tabSwitchCount = 0, maxTabSwitches = 3, showTabSwitch = true }: TestProctoringBarProps) => (
  <div className="sticky top-0 z-40 -mx-6 -mt-2 px-6 py-2 mb-3 rounded-lg border-2 border-primary/40 bg-primary/10 flex flex-wrap items-center gap-2 sm:gap-4 shrink-0">
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 text-primary animate-pulse" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Proctoring Active</span>
      </div>
      <Badge variant="secondary" className="text-xs font-semibold bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30">
        Live
      </Badge>
    </div>
    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Monitor className="h-3.5 w-3.5 text-primary" />
        <span>Full-screen</span>
      </div>
      {showTabSwitch && (
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span>Tab switch: {tabSwitchCount}/{maxTabSwitches}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Camera className="h-3.5 w-3.5 text-primary" />
        <span>Webcam</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5 text-primary" />
        <span>AI monitoring</span>
      </div>
    </div>
  </div>
);

export default TestProctoringBar;
