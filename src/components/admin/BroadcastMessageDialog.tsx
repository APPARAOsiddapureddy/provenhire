import { useState } from "react";
import DOMPurify from "dompurify";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Checkbox } from "@/components/ui/checkbox";

const AUDIENCE_OPTIONS = [
  { id: "all", label: "All Users" },
  { id: "jobseeker", label: "Job Seekers" },
  { id: "recruiter", label: "Recruiters" },
  { id: "expert_interviewer", label: "Interviewers" },
] as const;

interface BroadcastMessageDialogProps {
  stats: {
    totalJobSeekers: number;
    totalRecruiters: number;
    totalInterviewers: number;
  };
  onSent: () => void;
  trigger?: React.ReactNode;
  /** When set, dialog opens in single-recipient mode (e.g. from row action) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialRecipient?: { userId: string; label: string };
}

export default function BroadcastMessageDialog({
  stats,
  onSent,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialRecipient,
}: BroadcastMessageDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [targetRoles, setTargetRoles] = useState<string[]>(["jobseeker"]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const singleUser = initialRecipient ? { userId: initialRecipient.userId, label: initialRecipient.label } : null;

  const toggleRole = (id: string) => {
    if (id === "all") {
      setTargetRoles((prev) => (prev.length === 1 && prev[0] === "all" ? [] : ["all"]));
      return;
    }
    setTargetRoles((prev) => {
      const withoutAll = prev.filter((r) => r !== "all");
      const hasId = withoutAll.includes(id);
      if (hasId) {
        const next = withoutAll.filter((r) => r !== id);
        return next.length ? next : ["jobseeker"];
      }
      return [...withoutAll, id];
    });
  };

  const getEstimatedCount = () => {
    if (singleUser) return 1;
    if (targetRoles.includes("all")) {
      return stats.totalJobSeekers + stats.totalRecruiters + stats.totalInterviewers;
    }
    let n = 0;
    if (targetRoles.includes("jobseeker")) n += stats.totalJobSeekers;
    if (targetRoles.includes("recruiter")) n += stats.totalRecruiters;
    if (targetRoles.includes("expert_interviewer")) n += stats.totalInterviewers;
    return n;
  };

  const handleSend = async () => {
    if (!title.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!message.trim() || message === "<p><br></p>") {
      toast.error("Please enter a message");
      return;
    }
    if (!singleUser && targetRoles.length === 0) {
      toast.error("Please select at least one audience");
      return;
    }
    setSending(true);
    try {
      const payload = singleUser
        ? { recipientIds: [singleUser.userId], title: title.trim(), message, sendEmail }
        : { targetRoles, title: title.trim(), message, sendEmail };
      const res = await api.post<{
        ok: boolean;
        inAppCount: number;
        emailSent: number;
        emailFailed: number;
        emailSkipped: boolean;
      }>("/api/admin/notifications/broadcast", payload);
      const { inAppCount, emailSent, emailFailed, emailSkipped } = res;
      toast.success(
        `Sent to ${inAppCount} users in-app` +
          (sendEmail && !emailSkipped ? `, ${emailSent} emails sent` : "") +
          (emailFailed > 0 ? `, ${emailFailed} failed` : "")
      );
      if (sendEmail && emailSkipped) {
        toast.info("Email skipped: add RESEND_API_KEY to server/.env to enable");
      }
      setOpen(false);
      setTitle("");
      setMessage("");
      setTargetRoles(["jobseeker"]);
      setSendEmail(false);
      onSent();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm">
              <MessageSquare className="h-4 w-4 mr-2" />
              Send Message
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Broadcast Message</DialogTitle>
            <DialogDescription>
              In-app notifications appear in the bell icon. Optionally send email via Resend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {singleUser ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">Sending to:</p>
                <p className="text-muted-foreground mt-1">{singleUser.label}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Audience (multi-select)</Label>
                <div className="flex flex-wrap gap-4">
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <div key={opt.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={opt.id}
                        checked={targetRoles.includes(opt.id)}
                        onCheckedChange={() => toggleRole(opt.id)}
                      />
                      <label
                        htmlFor={opt.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {opt.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Message subject..."
              />
            </div>

            <div className="space-y-2">
              <Label>Message (rich text)</Label>
              <div className="rounded-lg border border-border overflow-hidden [&_.ql-container]:min-h-[120px] [&_.ql-editor]:min-h-[120px]">
                <ReactQuill
                  theme="snow"
                  value={message}
                  onChange={setMessage}
                  placeholder="Type your message..."
                  modules={{
                    toolbar: [["bold", "italic", "underline"], ["link"], [{ list: "ordered" }, { list: "bullet" }]],
                  }}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={(c) => setSendEmail(!!c)}
              />
              <label
                htmlFor="sendEmail"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Also send via email (requires RESEND_API_KEY)
              </label>
            </div>

            {(title || message) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">Will be sent to:</p>
                <p className="text-muted-foreground mt-1">
                  {singleUser
                    ? `1 user (${singleUser.label})`
                    : `~${getEstimatedCount()} users${
                        targetRoles.includes("all")
                          ? " (Job Seekers + Recruiters + Interviewers)"
                          : ` (${targetRoles.join(", ")})`
                      }`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>How the message will appear</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Subject</p>
              <p className="font-medium">{title || "(No subject)"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Message</p>
              <div
                className="prose prose-sm dark:prose-invert max-w-none rounded border border-border p-3 bg-muted/20"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(message || "<p><em>No message</em></p>", {
                    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "a", "ul", "ol", "li"],
                  }),
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
