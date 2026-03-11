import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  AlertTriangle,
  Eye,
  Monitor,
  User,
  Mic,
  CheckCircle,
  Volume2,
  Smartphone,
  Users,
  ArrowLeftRight,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useProctorSocket } from "@/hooks/useProctorSocket";

interface ProctoringAlert {
  id?: string;
  userId?: string;
  sessionId: string;
  testType?: string | null;
  type: string;
  severity: string;
  message: string;
  details?: Record<string, unknown> | null;
  riskScore?: number;
  createdAt: string;
  screenshotPath?: string | null;
}

const API_BASE = "";

const RealtimeProctoringAlerts = () => {
  const [alerts, setAlerts] = useState<ProctoringAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useProctorSocket({
    recruiterMode: true,
    onEvent: (payload) => {
      setAlerts((prev) => [
        {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sessionId: payload.sessionId,
          type: payload.event,
          severity: "high",
          message: `⚠ ${payload.event.replace(/_/g, " ")}`,
          createdAt: payload.timestamp ?? new Date().toISOString(),
          screenshotPath: payload.screenshotPath,
        },
        ...prev,
      ].slice(0, 50));
      setUnreadCount((c) => c + 1);
      if (soundEnabled) {
        try {
          const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAHe9TL1mJaAAN5yKvSWmQABXK3g7pYbQQMbb+D2lhsAwdrsnHTVGoDC3Czi81PagMNcbOL1FFnAhFwr43STmYDEG+ujdRQZgMRbq2O005mAxJurY7TT2YDEW6sjtNPZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQM=");
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch {}
      }
    },
  });

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const { alerts } = await api.get<{ alerts: ProctoringAlert[] }>("/api/proctoring/alerts");
      setAlerts(alerts || []);
      setUnreadCount(alerts?.length || 0);
    } catch (error: any) {
      console.error('Error fetching alerts:', error);
    }
  };

  const playAlertSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAHe9TL1mJaAAN5yKvSWmQABXK3g7pYbQQMbb+D2lhsAwdrsnHTVGoDC3Czi81PagMNcbOL1FFnAhFwr43STmYDEG+ujdRQZgMRbq2O005mAxJurY7TT2YDEW6sjtNPZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxFurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQMSbqyO005lAxJurI7TTmUDEm6sjtNOZQM=');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      // Ignore audio errors
    }
  };

  const markAsRead = async (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (!alertId.startsWith("live-")) {
      try {
        await api.post("/api/proctoring/alerts/read", { alertId });
      } catch (error: unknown) {
        toast.error("Failed to mark as read");
      }
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = alerts.map((a) => a.id);
      if (unreadIds.length === 0) return;
      await api.post("/api/proctoring/alerts/read", { alertIds: unreadIds });

      setAlerts([]);
      setUnreadCount(0);
      toast.success('All alerts marked as read');
    } catch (error: any) {
      toast.error('Failed to mark all as read');
    }
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case "tab_switch":
        return <Monitor className="h-4 w-4" />;
      case "face_violation":
      case "FACE_MISSING":
        return <User className="h-4 w-4" />;
      case "PHONE_DETECTED":
        return <Smartphone className="h-4 w-4" />;
      case "MULTIPLE_PERSONS":
        return <Users className="h-4 w-4" />;
      case "LOOKING_AWAY":
        return <ArrowLeftRight className="h-4 w-4" />;
      case "MOUTH_OPEN":
        return <MessageCircle className="h-4 w-4" />;
      case "SPOOF_DETECTED":
        return <AlertTriangle className="h-4 w-4" />;
      case "audio_violation":
        return <Mic className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle className="text-lg">Real-time Alerts</CardTitle>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={soundEnabled ? 'text-primary' : 'text-muted-foreground'}
            >
              <Volume2 className="h-4 w-4" />
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          Live proctoring violation notifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No alerts yet</p>
              <p className="text-sm mt-1">Alerts will appear here in real-time</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${
                    alert.severity === 'high'
                      ? 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                      : 'bg-muted/30 border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded ${
                        alert.severity === 'high' 
                          ? 'bg-red-100 dark:bg-red-900' 
                          : 'bg-amber-100 dark:bg-amber-900'
                      }`}>
                        {getAlertIcon(alert.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor(alert.severity) as any}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {alert.testType === 'aptitude' ? 'Aptitude' : 
                             alert.testType === 'dsa' ? 'DSA' : 
                             alert.testType === 'ai_interview' ? 'AI Interview' : (alert.testType || 'Assessment')}
                          </Badge>
                          {typeof alert.riskScore === "number" && (
                            <Badge variant="secondary">Risk {alert.riskScore}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatTime(alert.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{alert.message}</p>
                        {alert.userId && (
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            User: {(alert.userId || "").slice(0, 8)}...
                          </p>
                        )}
                        {alert.screenshotPath && (
                          <a
                            href={`${API_BASE}${alert.screenshotPath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            View screenshot →
                          </a>
                        )}
                      </div>
                    </div>
                    {alert.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(alert.id!)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default RealtimeProctoringAlerts;
