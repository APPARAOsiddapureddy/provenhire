import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  XCircle,
  Volume2
} from "lucide-react";
import { toast } from "sonner";

interface ProctoringAlert {
  id: string;
  user_id: string;
  test_id: string;
  test_type: string;
  alert_type: string;
  severity: string;
  message: string;
  violation_details: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

const RealtimeProctoringAlerts = () => {
  const [alerts, setAlerts] = useState<ProctoringAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Fetch existing alerts
    fetchAlerts();

    // Subscribe to realtime alerts
    const channel = supabase
      .channel('proctoring-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proctoring_alerts',
        },
        (payload) => {
          const newAlert = payload.new as ProctoringAlert;
          setAlerts(prev => [newAlert, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);
          
          // Show toast notification
          if (newAlert.severity === 'high') {
            toast.error(`High-risk alert: ${newAlert.message}`, {
              duration: 10000,
            });
            // Play sound if enabled
            if (soundEnabled) {
              playAlertSound();
            }
          } else {
            toast.warning(`Proctoring alert: ${newAlert.message}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('proctoring_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAlerts((data || []).map(d => ({
        ...d,
        violation_details: (d.violation_details as Record<string, unknown>) || {}
      })));
      setUnreadCount(data?.filter(a => !a.is_read).length || 0);
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
    try {
      const { error } = await supabase
        .from('proctoring_alerts')
        .update({ is_read: true })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts(prev => 
        prev.map(a => a.id === alertId ? { ...a, is_read: true } : a)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      toast.error('Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id);
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from('proctoring_alerts')
        .update({ is_read: true })
        .in('id', unreadIds);

      if (error) throw error;

      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      setUnreadCount(0);
      toast.success('All alerts marked as read');
    } catch (error: any) {
      toast.error('Failed to mark all as read');
    }
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'tab_switch':
        return <Monitor className="h-4 w-4" />;
      case 'face_violation':
        return <User className="h-4 w-4" />;
      case 'audio_violation':
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
                    !alert.is_read 
                      ? 'bg-primary/5 border-primary/20' 
                      : 'bg-muted/30 border-border'
                  } ${
                    alert.severity === 'high' && !alert.is_read
                      ? 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded ${
                        alert.severity === 'high' 
                          ? 'bg-red-100 dark:bg-red-900' 
                          : 'bg-amber-100 dark:bg-amber-900'
                      }`}>
                        {getAlertIcon(alert.alert_type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor(alert.severity) as any}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {alert.test_type === 'aptitude' ? 'Aptitude' : 
                             alert.test_type === 'dsa' ? 'DSA' : 
                             alert.test_type === 'ai_interview' ? 'AI Interview' : alert.test_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(alert.created_at)}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          User: {alert.user_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                    {!alert.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(alert.id)}
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
