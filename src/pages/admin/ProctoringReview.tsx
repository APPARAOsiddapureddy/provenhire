import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Camera, CheckCircle, Eye, Flag, Mic, Monitor, Play, User, Video, XCircle, RotateCcw, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { invalidateTest, getRecordingUrl } from "@/utils/recordingUpload";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProctoringData {
  tabSwitchCount: number;
  violations: string[];
  webcamSnapshot: string | null;
  faceViolations: number;
  audioViolations: number;
  screenRecordingBlob?: string;
  baselineSnapshot?: string;
}

interface TestResult {
  id: string;
  user_id: string;
  completed_at: string;
  passed: boolean;
  total_score: number;
  answers?: {
    proctoring?: ProctoringData;
    antiCheatData?: ProctoringData;
  };
  difficulty: string;
  is_invalidated?: boolean;
  invalidation_reason?: string;
  screen_recording_url?: string;
}

interface FlaggedTest {
  id: string;
  userId: string;
  userEmail?: string;
  testType: "aptitude" | "dsa";
  completedAt: string;
  passed: boolean;
  score: number;
  tabSwitches: number;
  faceViolations: number;
  audioViolations: number;
  violations: string[];
  webcamSnapshot: string | null;
  severity: "low" | "medium" | "high";
  isInvalidated: boolean;
  invalidationReason?: string;
  screenRecordingUrl?: string;
}

const ProctoringReview = () => {
  const [flaggedTests, setFlaggedTests] = useState<FlaggedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<FlaggedTest | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [invalidateDialogOpen, setInvalidateDialogOpen] = useState(false);
  const [invalidationReason, setInvalidationReason] = useState("");
  const [invalidating, setInvalidating] = useState(false);
  const [loadingRecording, setLoadingRecording] = useState(false);
  const [currentRecordingUrl, setCurrentRecordingUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchFlaggedTests();
  }, []);

  const fetchFlaggedTests = async () => {
    setLoading(true);
    try {
      // Fetch aptitude test results
      const { data: aptitudeData } = await supabase
        .from("aptitude_test_results")
        .select("*")
        .order("completed_at", { ascending: false })
        .limit(100);

      // Fetch DSA test results
      const { data: dsaData } = await supabase
        .from("dsa_round_results")
        .select("*")
        .order("completed_at", { ascending: false })
        .limit(100);

      const flagged: FlaggedTest[] = [];

      // Process aptitude tests
      if (aptitudeData) {
        aptitudeData.forEach((test: any) => {
          const answers = test.answers as any;
          const proctoring = answers?.proctoring || answers?.antiCheatData;
          if (proctoring) {
            const tabSwitches = proctoring.tabSwitchCount || 0;
            const faceViolations = proctoring.faceViolations || 0;
            const audioViolations = proctoring.audioViolations || 0;
            const totalViolations = tabSwitches + faceViolations + audioViolations;

            if (totalViolations > 0) {
              let severity: "low" | "medium" | "high" = "low";
              if (totalViolations >= 5 || faceViolations >= 2) {
                severity = "high";
              } else if (totalViolations >= 3) {
                severity = "medium";
              }

              flagged.push({
                id: test.id,
                userId: test.user_id,
                testType: "aptitude",
                completedAt: test.completed_at,
                passed: test.passed,
                score: test.total_score,
                tabSwitches,
                faceViolations,
                audioViolations,
                violations: proctoring.violations || [],
                webcamSnapshot: proctoring.webcamSnapshot || null,
                severity,
                isInvalidated: test.is_invalidated || false,
                invalidationReason: test.invalidation_reason,
                screenRecordingUrl: test.screen_recording_url,
              });
            }
          }
        });
      }

      // Process DSA tests
      if (dsaData) {
        dsaData.forEach((test: any) => {
          const proctoring = test.solutions?.proctoring || test.solutions?.antiCheatData;
          if (proctoring) {
            const tabSwitches = proctoring.tabSwitchCount || 0;
            const faceViolations = proctoring.faceViolations || 0;
            const audioViolations = proctoring.audioViolations || 0;
            const totalViolations = tabSwitches + faceViolations + audioViolations;

            if (totalViolations > 0) {
              let severity: "low" | "medium" | "high" = "low";
              if (totalViolations >= 5 || faceViolations >= 2) {
                severity = "high";
              } else if (totalViolations >= 3) {
                severity = "medium";
              }

              flagged.push({
                id: test.id,
                userId: test.user_id,
                testType: "dsa",
                completedAt: test.completed_at,
                passed: test.passed,
                score: test.total_score,
                tabSwitches,
                faceViolations,
                audioViolations,
                violations: proctoring.violations || [],
                webcamSnapshot: proctoring.webcamSnapshot || null,
                severity,
                isInvalidated: test.is_invalidated || false,
                invalidationReason: test.invalidation_reason,
                screenRecordingUrl: test.screen_recording_url,
              });
            }
          }
        });
      }

      // Sort by severity (high first) and then by date
      flagged.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      });

      setFlaggedTests(flagged);
    } catch (error: any) {
      console.error("Error fetching flagged tests:", error);
      toast.error("Failed to fetch proctoring data");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSeverityBadge = (severity: "low" | "medium" | "high") => {
    switch (severity) {
      case "high":
        return <Badge variant="destructive">High Risk</Badge>;
      case "medium":
        return <Badge className="bg-amber-500 hover:bg-amber-600">Medium Risk</Badge>;
      case "low":
        return <Badge variant="secondary">Low Risk</Badge>;
    }
  };

  const openTestDetails = (test: FlaggedTest) => {
    setSelectedTest(test);
    setDetailDialogOpen(true);
  };

  const stats = {
    total: flaggedTests.length,
    high: flaggedTests.filter((t) => t.severity === "high").length,
    medium: flaggedTests.filter((t) => t.severity === "medium").length,
    low: flaggedTests.filter((t) => t.severity === "low").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
                <Flag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Flagged</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.high}</p>
                <p className="text-sm text-muted-foreground">High Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900">
                <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.medium}</p>
                <p className="text-sm text-muted-foreground">Medium Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg dark:bg-gray-800">
                <CheckCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.low}</p>
                <p className="text-sm text-muted-foreground">Low Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flagged Tests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Flagged Proctoring Sessions
          </CardTitle>
          <CardDescription>
            Review tests with proctoring violations for potential cheating
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flaggedTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No flagged proctoring sessions found</p>
              <p className="text-sm mt-1">All tests appear to be clean</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Test Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Tab Switches</TableHead>
                  <TableHead>Face Issues</TableHead>
                  <TableHead>Audio Issues</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flaggedTests.map((test) => (
                  <TableRow key={test.id} className={test.severity === "high" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-mono text-xs">
                      {test.userId.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {test.testType === "aptitude" ? "Aptitude" : "DSA"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(test.completedAt)}</TableCell>
                    <TableCell>
                      {test.passed ? (
                        <Badge className="bg-green-500">Passed ({test.score})</Badge>
                      ) : (
                        <Badge variant="destructive">Failed ({test.score})</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className={test.tabSwitches >= 3 ? "text-red-500 font-semibold" : ""}>
                          {test.tabSwitches}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className={test.faceViolations >= 2 ? "text-red-500 font-semibold" : ""}>
                          {test.faceViolations}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Mic className="h-4 w-4 text-muted-foreground" />
                        <span className={test.audioViolations >= 2 ? "text-red-500 font-semibold" : ""}>
                          {test.audioViolations}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getSeverityBadge(test.severity)}</TableCell>
                    <TableCell>
                      {test.isInvalidated ? (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Invalidated
                        </Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openTestDetails(test)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Test Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Proctoring Review - {selectedTest?.testType === "aptitude" ? "Aptitude Test" : "DSA Round"}
            </DialogTitle>
            <DialogDescription>
              Detailed review of flagged proctoring session
            </DialogDescription>
          </DialogHeader>

          {selectedTest && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="violations">Violations</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h4 className="font-semibold text-sm">Test Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">User ID:</span>
                          <span className="font-mono">{selectedTest.userId.slice(0, 12)}...</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Test Type:</span>
                          <span>{selectedTest.testType === "aptitude" ? "Aptitude" : "DSA"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date:</span>
                          <span>{formatDate(selectedTest.completedAt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Score:</span>
                          <span>{selectedTest.score}/15</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Result:</span>
                          {selectedTest.passed ? (
                            <Badge className="bg-green-500">Passed</Badge>
                          ) : (
                            <Badge variant="destructive">Failed</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h4 className="font-semibold text-sm">Violation Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Monitor className="h-4 w-4" /> Tab Switches:
                          </span>
                          <Badge variant={selectedTest.tabSwitches >= 3 ? "destructive" : "secondary"}>
                            {selectedTest.tabSwitches}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <User className="h-4 w-4" /> Face Issues:
                          </span>
                          <Badge variant={selectedTest.faceViolations >= 2 ? "destructive" : "secondary"}>
                            {selectedTest.faceViolations}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Mic className="h-4 w-4" /> Audio Issues:
                          </span>
                          <Badge variant={selectedTest.audioViolations >= 2 ? "destructive" : "secondary"}>
                            {selectedTest.audioViolations}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t">
                          <span className="font-medium">Risk Level:</span>
                          {getSeverityBadge(selectedTest.severity)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="violations" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-sm mb-3">Violation Timeline</h4>
                    {selectedTest.violations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No detailed violations logged</p>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {selectedTest.violations.map((violation, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                              <span className="text-sm">{violation}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="evidence" className="mt-4">
                <div className="space-y-4">
                  {/* Webcam Snapshot */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Webcam Snapshot
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedTest.webcamSnapshot ? (
                        <div className="relative">
                          <img
                            src={selectedTest.webcamSnapshot}
                            alt="Webcam capture during test"
                            className="rounded-lg border max-w-full h-auto"
                          />
                          <p className="text-xs text-muted-foreground mt-2">
                            Captured during test session
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-48 bg-muted rounded-lg">
                          <div className="text-center text-muted-foreground">
                            <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No webcam snapshot available</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Screen Recording */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Screen Recording
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedTest.screenRecordingUrl ? (
                        <div className="space-y-3">
                          {currentRecordingUrl ? (
                            <video
                              src={currentRecordingUrl}
                              controls
                              className="w-full rounded-lg border"
                            >
                              Your browser does not support the video tag.
                            </video>
                          ) : (
                            <div className="flex items-center justify-center h-48 bg-muted rounded-lg">
                              <Button
                                onClick={async () => {
                                  setLoadingRecording(true);
                                  // Extract file path from the URL or use the stored path
                                  const url = selectedTest.screenRecordingUrl;
                                  if (url) {
                                    setCurrentRecordingUrl(url);
                                  }
                                  setLoadingRecording(false);
                                }}
                                disabled={loadingRecording}
                              >
                                {loadingRecording ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Loading...
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Load Recording
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (currentRecordingUrl) {
                                  window.open(currentRecordingUrl, '_blank');
                                }
                              }}
                              disabled={!currentRecordingUrl}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-32 bg-muted rounded-lg">
                          <div className="text-center text-muted-foreground">
                            <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No screen recording available</p>
                            <p className="text-xs">Recording may not have been enabled for this test</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <div className="flex justify-between items-center mt-4">
            {selectedTest?.isInvalidated && (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Test Invalidated</span>
                {selectedTest.invalidationReason && (
                  <span className="text-xs text-muted-foreground">
                    - {selectedTest.invalidationReason}
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => {
                setDetailDialogOpen(false);
                setCurrentRecordingUrl(null);
              }}>
                Close
              </Button>
              {!selectedTest?.isInvalidated && (
                <Button 
                  variant="destructive" 
                  onClick={() => {
                    setInvalidateDialogOpen(true);
                  }}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Invalidate Test
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invalidation Confirmation Dialog */}
      <AlertDialog open={invalidateDialogOpen} onOpenChange={setInvalidateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Invalidate Test
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action will mark the test as invalid and require the candidate to retake it.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Reason for invalidation
            </label>
            <Textarea
              placeholder="Enter the reason for invalidating this test..."
              value={invalidationReason}
              onChange={(e) => setInvalidationReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setInvalidationReason("");
            }}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!selectedTest || !invalidationReason.trim()) {
                  toast.error("Please provide a reason for invalidation");
                  return;
                }
                
                setInvalidating(true);
                const result = await invalidateTest(
                  selectedTest.id,
                  selectedTest.testType,
                  invalidationReason.trim()
                );
                
                if (result.success) {
                  toast.success("Test has been invalidated. Candidate must retake.");
                  setInvalidateDialogOpen(false);
                  setDetailDialogOpen(false);
                  setInvalidationReason("");
                  fetchFlaggedTests(); // Refresh the list
                } else {
                  toast.error("Failed to invalidate test: " + result.error);
                }
                setInvalidating(false);
              }}
              disabled={invalidating || !invalidationReason.trim()}
            >
              {invalidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Invalidating...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Confirm Invalidation
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProctoringReview;