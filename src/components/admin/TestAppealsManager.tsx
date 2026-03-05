import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Scale, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock,
  FileText,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface TestAppeal {
  id: string;
  user_id: string;
  test_id: string;
  test_type: string;
  appeal_reason: string;
  supporting_evidence: string | null;
  evidence_url: string | null;
  status: string;
  admin_response: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const TestAppealsManager = () => {
  const [appeals, setAppeals] = useState<TestAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppeal, setSelectedAppeal] = useState<TestAppeal | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [adminResponse, setAdminResponse] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchAppeals();
  }, []);

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      const { appeals } = await api.get<{ appeals: TestAppeal[] }>("/api/appeals");
      setAppeals(appeals || []);
    } catch (error: any) {
      console.error('Error fetching appeals:', error);
      toast.error('Failed to load appeals');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (appeal: TestAppeal, action: 'approve' | 'reject') => {
    setSelectedAppeal(appeal);
    setAdminResponse("");
    setResponseDialogOpen(true);
  };

  const submitReview = async (action: 'approve' | 'reject') => {
    if (!selectedAppeal || !adminResponse.trim()) {
      toast.error('Please provide a response');
      return;
    }

    setProcessing(true);
    try {
      await api.post(`/api/appeals/${selectedAppeal.id}/status`, {
        status: action === 'approve' ? 'approved' : 'rejected',
      });

      // Reinstatement is handled server-side if needed

      toast.success(`Appeal ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      setResponseDialogOpen(false);
      fetchAppeals();
    } catch (error: any) {
      toast.error('Failed to process appeal');
      console.error('Error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingCount = appeals.filter(a => a.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
                <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{appeals.length}</p>
                <p className="text-sm text-muted-foreground">Total Appeals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {appeals.filter(a => a.status === 'approved').length}
                </p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {appeals.filter(a => a.status === 'rejected').length}
                </p>
                <p className="text-sm text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Appeals Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Test Invalidation Appeals
          </CardTitle>
          <CardDescription>
            Review and respond to candidate appeals for invalidated tests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {appeals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No appeals submitted yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Test Type</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appeals.map((appeal) => (
                  <TableRow key={appeal.id}>
                    <TableCell className="font-mono text-xs">
                      {appeal.user_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {appeal.test_type === 'aptitude' ? 'Aptitude' : 'DSA'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(appeal.created_at)}
                    </TableCell>
                    <TableCell>{getStatusBadge(appeal.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAppeal(appeal);
                            setDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {appeal.status === 'pending' && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleReview(appeal, 'approve')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleReview(appeal, 'reject')}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Appeal Details
            </DialogTitle>
            <DialogDescription className="sr-only">View and manage appeal submission</DialogDescription>
          </DialogHeader>
          {selectedAppeal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-sm">{selectedAppeal.user_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Test Type</Label>
                  <p>{selectedAppeal.test_type === 'aptitude' ? 'Aptitude Test' : 'DSA Round'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Submitted</Label>
                  <p>{formatDate(selectedAppeal.created_at)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedAppeal.status)}</div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Appeal Reason</Label>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {selectedAppeal.appeal_reason}
                </p>
              </div>

              {selectedAppeal.supporting_evidence && (
                <div>
                  <Label className="text-muted-foreground">Supporting Evidence</Label>
                  <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                    {selectedAppeal.supporting_evidence}
                  </p>
                </div>
              )}

              {selectedAppeal.evidence_url && (
                <div>
                  <Label className="text-muted-foreground">Evidence URL</Label>
                  <a 
                    href={selectedAppeal.evidence_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    {selectedAppeal.evidence_url}
                  </a>
                </div>
              )}

              {selectedAppeal.admin_response && (
                <div>
                  <Label className="text-muted-foreground">Admin Response</Label>
                  <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                    {selectedAppeal.admin_response}
                  </p>
                  {selectedAppeal.reviewed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reviewed on {formatDate(selectedAppeal.reviewed_at)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Response Dialog */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAppeal?.status === 'pending' ? 'Review Appeal' : 'Appeal Response'}
            </DialogTitle>
            <DialogDescription className="sr-only">Provide your decision and response</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Your Response</Label>
              <Textarea
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                placeholder="Provide your decision reasoning..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setResponseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => submitReview('reject')}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reject Appeal
            </Button>
            <Button
              onClick={() => submitReview('approve')}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Approve Appeal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TestAppealsManager;
