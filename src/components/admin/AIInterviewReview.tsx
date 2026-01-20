import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Loader2,
  Video,
  MessageSquare
} from "lucide-react";

interface InterviewSession {
  id: string;
  user_id: string;
  status: string;
  total_questions: number;
  questions_answered: number;
  overall_score: number | null;
  is_flagged: boolean;
  flag_reason: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

interface InterviewResponse {
  id: string;
  session_id: string;
  question_index: number;
  question_type: string;
  question_text: string;
  transcript: string | null;
  ai_score: number | null;
  ai_feedback: string | null;
  keywords_detected: string[] | null;
  is_flagged: boolean;
  flag_reason: string | null;
  video_url: string | null;
  response_duration_seconds: number | null;
}

const AIInterviewReview = () => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null);
  const [responses, setResponses] = useState<InterviewResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'flagged' | 'pending'>('flagged');

  useEffect(() => {
    fetchSessions();
  }, [filter]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('ai_interview_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (filter === 'flagged') {
        query = query.eq('is_flagged', true);
      } else if (filter === 'pending') {
        query = query.lt('overall_score', 60);
      }
      
      const { data, error } = await query.limit(50);
      
      if (error) throw error;
      setSessions(data || []);
    } catch (error: any) {
      console.error('Error fetching sessions:', error);
      toast({
        title: "Error loading sessions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async (sessionId: string) => {
    setLoadingResponses(true);
    try {
      const { data, error } = await supabase
        .from('ai_interview_responses')
        .select('*')
        .eq('session_id', sessionId)
        .order('question_index', { ascending: true });
      
      if (error) throw error;
      setResponses(data || []);
    } catch (error: any) {
      console.error('Error fetching responses:', error);
      toast({
        title: "Error loading responses",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingResponses(false);
    }
  };

  const viewSession = async (session: InterviewSession) => {
    setSelectedSession(session);
    await fetchResponses(session.id);
    setReviewDialogOpen(true);
  };

  const approveSession = async () => {
    if (!selectedSession) return;
    setActionLoading(true);
    
    try {
      // Update session
      await supabase
        .from('ai_interview_sessions')
        .update({
          is_flagged: false,
          flag_reason: null,
          overall_score: Math.max(selectedSession.overall_score || 0, 60)
        })
        .eq('id', selectedSession.id);
      
      // Update verification stage
      await supabase
        .from('verification_stages')
        .update({
          status: 'completed',
          score: Math.max(selectedSession.overall_score || 0, 60),
          completed_at: new Date().toISOString()
        })
        .eq('user_id', selectedSession.user_id)
        .eq('stage_name', 'expert_interview');
      
      // Update profile
      await supabase
        .from('job_seeker_profiles')
        .update({ verification_status: 'verified' })
        .eq('user_id', selectedSession.user_id);
      
      toast({
        title: "Session Approved",
        description: "The candidate has been verified successfully.",
      });
      
      setReviewDialogOpen(false);
      fetchSessions();
    } catch (error: any) {
      toast({
        title: "Error approving session",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const rejectSession = async () => {
    if (!selectedSession) return;
    setActionLoading(true);
    
    try {
      // Update session
      await supabase
        .from('ai_interview_sessions')
        .update({
          status: 'failed',
          flag_reason: adminNotes || 'Rejected by admin'
        })
        .eq('id', selectedSession.id);
      
      // Update verification stage
      await supabase
        .from('verification_stages')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('user_id', selectedSession.user_id)
        .eq('stage_name', 'expert_interview');
      
      toast({
        title: "Session Rejected",
        description: "The candidate's interview has been rejected.",
      });
      
      setReviewDialogOpen(false);
      setAdminNotes('');
      fetchSessions();
    } catch (error: any) {
      toast({
        title: "Error rejecting session",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 75) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Interview Review</CardTitle>
            <CardDescription>
              Review and manage AI interview sessions
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant={filter === 'flagged' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilter('flagged')}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Flagged
            </Button>
            <Button 
              variant={filter === 'pending' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilter('pending')}
            >
              Low Scores
            </Button>
            <Button 
              variant={filter === 'all' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No interview sessions to review
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Flagged</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-mono text-xs">
                    {session.user_id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={getScoreColor(session.overall_score)}>
                    {session.overall_score ? `${Math.round(session.overall_score)}%` : '-'}
                  </TableCell>
                  <TableCell>
                    {session.questions_answered}/{session.total_questions}
                  </TableCell>
                  <TableCell>
                    {session.is_flagged ? (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Flagged
                      </Badge>
                    ) : (
                      <Badge variant="outline">Clear</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(session.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => viewSession(session)}>
                      <Eye className="h-4 w-4 mr-1" />
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Interview Session Review</DialogTitle>
              <DialogDescription>
                Review all responses from this interview session
              </DialogDescription>
            </DialogHeader>
            
            {selectedSession && (
              <div className="space-y-4">
                <div className="flex gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Overall Score</div>
                    <div className={`text-2xl font-bold ${getScoreColor(selectedSession.overall_score)}`}>
                      {selectedSession.overall_score ? `${Math.round(selectedSession.overall_score)}%` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Questions Answered</div>
                    <div className="text-2xl font-bold">
                      {selectedSession.questions_answered}/{selectedSession.total_questions}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <Badge className="mt-1">{selectedSession.status}</Badge>
                  </div>
                  {selectedSession.is_flagged && (
                    <div>
                      <div className="text-sm text-muted-foreground">Flag Reason</div>
                      <div className="text-sm text-red-600">{selectedSession.flag_reason || 'Flagged for review'}</div>
                    </div>
                  )}
                </div>
                
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {loadingResponses ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : (
                      responses.map((response, index) => (
                        <div key={response.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{response.question_type}</Badge>
                              <span className="font-medium">Question {index + 1}</span>
                              {response.is_flagged && (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Flagged
                                </Badge>
                              )}
                            </div>
                            <div className={`font-bold ${getScoreColor(response.ai_score)}`}>
                              {response.ai_score ? `${Math.round(response.ai_score)}%` : '-'}
                            </div>
                          </div>
                          
                          <div className="bg-primary/5 p-3 rounded text-sm">
                            <strong>Q:</strong> {response.question_text}
                          </div>
                          
                          {response.transcript && (
                            <div className="bg-muted/50 p-3 rounded text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                                <MessageSquare className="h-3 w-3" />
                                Transcript
                              </div>
                              {response.transcript}
                            </div>
                          )}
                          
                          {response.ai_feedback && (
                            <div className="text-sm">
                              <strong>AI Feedback:</strong> {response.ai_feedback}
                            </div>
                          )}
                          
                          {response.flag_reason && (
                            <div className="text-sm text-red-600">
                              <strong>Flag Reason:</strong> {response.flag_reason}
                            </div>
                          )}
                          
                          {response.keywords_detected && response.keywords_detected.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {response.keywords_detected.map((keyword, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{keyword}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                
                <div>
                  <label className="text-sm font-medium">Admin Notes (optional)</label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes for rejection reason..."
                    className="mt-1"
                  />
                </div>
                
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                    Close
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={rejectSession}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                    Reject
                  </Button>
                  <Button 
                    onClick={approveSession}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Approve & Verify
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AIInterviewReview;
