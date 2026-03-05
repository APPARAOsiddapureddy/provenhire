import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

interface Message {
  id: string;
  subject: string;
  title?: string;
  message: string;
  is_read: boolean;
  read?: boolean;
  created_at: string;
}

const NotificationInbox = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [open, setOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupShown, setPopupShown] = useState(false);

  const unreadMessages = messages.filter((m) => !m.is_read && !m.read);
  const unreadCount = unreadMessages.length;
  const latestUnread = unreadMessages[0];

  const fetchMessages = async () => {
    if (!user) return;
    try {
      const { notifications } = await api.get<{ notifications: Message[] }>("/api/notifications");
      if (notifications) {
        setMessages(notifications.map((n) => ({ ...n, is_read: n.read ?? n.is_read ?? false })));
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchMessages();
  }, [user]);

  useEffect(() => {
    if (latestUnread && !popupShown && user) {
      setPopupOpen(true);
      setPopupShown(true);
    }
  }, [latestUnread, popupShown, user]);

  const markAsRead = async (id: string) => {
    await api.post("/api/notifications/read", { id });
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_read: true } : m))
    );
  };

  const handlePopupClose = () => {
    if (latestUnread) markAsRead(latestUnread.id);
    setPopupOpen(false);
  };

  if (!user) return null;

  return (
    <>
      <Dialog open={popupOpen} onOpenChange={(o) => { setPopupOpen(o); if (!o) handlePopupClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{latestUnread?.subject ?? latestUnread?.title ?? "Notification"}</DialogTitle>
            <DialogDescription className="sr-only">Notification message content</DialogDescription>
          </DialogHeader>
          <div
            className="text-sm text-muted-foreground py-2 prose prose-sm max-w-none [&_*]:text-inherit [&_*]:text-sm"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(latestUnread?.message || "", { ALLOWED_TAGS: ["p", "br", "b", "i", "u", "a", "ul", "ol", "li"] }),
            }}
          />
          <Button onClick={handlePopupClose}>Got it</Button>
        </DialogContent>
      </Dialog>
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) fetchMessages(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-border p-3">
          <h4 className="font-semibold">Notifications</h4>
        </div>
        <ScrollArea className="h-80">
          {messages.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    !msg.is_read ? "bg-primary/5" : ""
                  }`}
                  onClick={() => markAsRead(msg.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{msg.subject}</p>
                    {!msg.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                  <div
                    className="text-xs text-muted-foreground line-clamp-2 mt-1 prose prose-sm max-w-none [&_*]:text-inherit [&_*]:text-xs"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(msg.message || "", { ALLOWED_TAGS: ["p", "br", "b", "i", "u", "a", "ul", "ol", "li"] }),
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(msg.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
    </>
  );
};

export default NotificationInbox;
