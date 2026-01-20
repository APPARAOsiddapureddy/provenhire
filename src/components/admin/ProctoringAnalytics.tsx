import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { 
  AlertTriangle, 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Eye,
  Monitor,
  User,
  Mic,
  RefreshCw,
  Loader2,
  Download,
  FileText
} from "lucide-react";
import { getProctoringAnalytics, RETAKE_COOLDOWN_HOURS } from "@/utils/recordingUpload";
import { downloadCSV, exportToPDF } from "@/utils/exportAnalytics";
import { toast } from "sonner";

interface AnalyticsData {
  dailyStats: { date: string; violations: number; invalidations: number; tests: number }[];
  violationTypes: { type: string; count: number }[];
  totalStats: { 
    totalTests: number; 
    totalViolations: number; 
    totalInvalidations: number; 
    violationRate: number;
    invalidationRate: number;
  };
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

const ProctoringAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const fetchAnalytics = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);
      else setLoading(true);
      
      const data = await getProctoringAnalytics();
      setAnalytics(data);
      
      if (showToast) {
        toast.success("Analytics refreshed");
      }
    } catch (error: any) {
      toast.error("Failed to load analytics");
      console.error("Analytics error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load analytics data</p>
        <Button onClick={() => fetchAnalytics()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const { dailyStats, violationTypes, totalStats } = analytics;

  // Calculate week-over-week change
  const lastWeekViolations = dailyStats.slice(-7).reduce((acc, d) => acc + d.violations, 0);
  const prevWeekViolations = dailyStats.slice(-14, -7).reduce((acc, d) => acc + d.violations, 0);
  const weekChange = prevWeekViolations > 0 
    ? Math.round(((lastWeekViolations - prevWeekViolations) / prevWeekViolations) * 100)
    : 0;

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Proctoring Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Last 30 days overview • Cooldown period: {RETAKE_COOLDOWN_HOURS} hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              downloadCSV();
              toast.success("CSV downloaded");
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              exportToPDF();
              toast.success("PDF opened for printing");
            }}
          >
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
                <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStats.totalTests}</p>
                <p className="text-sm text-muted-foreground">Total Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStats.totalViolations}</p>
                <p className="text-sm text-muted-foreground">Flagged Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900">
                <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStats.totalInvalidations}</p>
                <p className="text-sm text-muted-foreground">Invalidated</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Violation Rate</span>
                <Badge variant={totalStats.violationRate > 30 ? "destructive" : "secondary"}>
                  {totalStats.violationRate}%
                </Badge>
              </div>
              <Progress value={totalStats.violationRate} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {weekChange > 0 ? (
                <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900">
                  <TrendingUp className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              ) : (
                <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900">
                  <TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              )}
              <div>
                <p className="text-2xl font-bold">{weekChange >= 0 ? '+' : ''}{weekChange}%</p>
                <p className="text-sm text-muted-foreground">Week over Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violations Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Violations Trend</CardTitle>
            <CardDescription>Daily proctoring violations over last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyStats}>
                  <defs>
                    <linearGradient id="colorViolations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorInvalidations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate} 
                    className="text-xs"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                  <Tooltip 
                    labelFormatter={formatDate}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="violations" 
                    stroke="#f59e0b" 
                    fillOpacity={1}
                    fill="url(#colorViolations)" 
                    name="Flagged"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="invalidations" 
                    stroke="#ef4444" 
                    fillOpacity={1}
                    fill="url(#colorInvalidations)" 
                    name="Invalidated"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Violation Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Violation Types</CardTitle>
            <CardDescription>Distribution of proctoring violation categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {violationTypes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={violationTypes}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="type"
                      label={({ type, count }) => `${type}: ${count}`}
                      labelLine={false}
                    >
                      {violationTypes.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No violation data available</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Test Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily Test Volume</CardTitle>
          <CardDescription>Number of tests taken each day with violation breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyStats.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  labelFormatter={formatDate}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="tests" name="Total Tests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="violations" name="Flagged" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="invalidations" name="Invalidated" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Violation Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Violation Breakdown</CardTitle>
          <CardDescription>Detailed counts by violation category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { icon: Monitor, label: 'Tab Switches', key: 'Tab Switches', color: 'text-blue-500' },
              { icon: User, label: 'Face Issues', key: 'Face Detection', color: 'text-amber-500' },
              { icon: Mic, label: 'Audio Issues', key: 'Audio Violations', color: 'text-purple-500' },
              { icon: User, label: 'Multiple Faces', key: 'Multiple Faces', color: 'text-red-500' },
              { icon: Eye, label: 'No Face', key: 'No Face Detected', color: 'text-gray-500' },
            ].map(({ icon: Icon, label, key, color }) => {
              const count = violationTypes.find(v => v.type === key)?.count || 0;
              return (
                <div key={key} className="p-4 bg-muted/50 rounded-lg text-center">
                  <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProctoringAnalytics;
