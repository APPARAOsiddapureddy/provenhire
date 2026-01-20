import { getProctoringAnalytics } from './recordingUpload';

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

/**
 * Convert analytics data to CSV format
 */
export const exportToCSV = (analytics: AnalyticsData): string => {
  const lines: string[] = [];

  // Summary section
  lines.push('PROCTORING ANALYTICS REPORT');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Total Stats
  lines.push('SUMMARY STATISTICS');
  lines.push('Metric,Value');
  lines.push(`Total Tests,${analytics.totalStats.totalTests}`);
  lines.push(`Flagged Tests,${analytics.totalStats.totalViolations}`);
  lines.push(`Invalidated Tests,${analytics.totalStats.totalInvalidations}`);
  lines.push(`Violation Rate,${analytics.totalStats.violationRate}%`);
  lines.push(`Invalidation Rate,${analytics.totalStats.invalidationRate}%`);
  lines.push('');

  // Violation Types
  lines.push('VIOLATION BREAKDOWN');
  lines.push('Type,Count');
  analytics.violationTypes.forEach(v => {
    lines.push(`${v.type},${v.count}`);
  });
  lines.push('');

  // Daily Stats
  lines.push('DAILY STATISTICS');
  lines.push('Date,Total Tests,Flagged,Invalidated');
  analytics.dailyStats.forEach(day => {
    lines.push(`${day.date},${day.tests},${day.violations},${day.invalidations}`);
  });

  return lines.join('\n');
};

/**
 * Download analytics as CSV file
 */
export const downloadCSV = async (): Promise<void> => {
  const analytics = await getProctoringAnalytics();
  const csv = exportToCSV(analytics);
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `proctoring-analytics-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Generate PDF-ready HTML content for analytics
 */
export const generatePDFContent = (analytics: AnalyticsData): string => {
  const { dailyStats, violationTypes, totalStats } = analytics;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Proctoring Analytics Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
        }
        h1 {
          color: #1a1a2e;
          border-bottom: 2px solid #3b82f6;
          padding-bottom: 10px;
        }
        h2 {
          color: #1a1a2e;
          margin-top: 30px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin: 20px 0;
        }
        .stat-card {
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #3b82f6;
        }
        .stat-value {
          font-size: 32px;
          font-weight: bold;
          color: #1a1a2e;
        }
        .stat-label {
          color: #64748b;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        th {
          background: #f1f5f9;
          font-weight: 600;
        }
        .violation-bar {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bar {
          height: 20px;
          background: #3b82f6;
          border-radius: 4px;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 12px;
        }
        @media print {
          body { margin: 20px; }
          .stat-card { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <h1>🛡️ ProvenHire Proctoring Analytics Report</h1>
      <p>Generated on: ${new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</p>

      <h2>Summary Statistics</h2>
      <div class="summary-grid">
        <div class="stat-card">
          <div class="stat-value">${totalStats.totalTests}</div>
          <div class="stat-label">Total Tests (30 days)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalStats.totalViolations}</div>
          <div class="stat-label">Flagged Tests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalStats.totalInvalidations}</div>
          <div class="stat-label">Invalidated Tests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalStats.violationRate}%</div>
          <div class="stat-label">Violation Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalStats.invalidationRate}%</div>
          <div class="stat-label">Invalidation Rate</div>
        </div>
      </div>

      <h2>Violation Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Violation Type</th>
            <th>Count</th>
            <th>Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${violationTypes.map(v => {
            const maxCount = Math.max(...violationTypes.map(x => x.count), 1);
            const percentage = Math.round((v.count / maxCount) * 100);
            return `
              <tr>
                <td>${v.type}</td>
                <td>${v.count}</td>
                <td>
                  <div class="violation-bar">
                    <div class="bar" style="width: ${percentage}%"></div>
                    <span>${percentage}%</span>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <h2>Daily Statistics (Last 14 Days)</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Total Tests</th>
            <th>Flagged</th>
            <th>Invalidated</th>
          </tr>
        </thead>
        <tbody>
          ${dailyStats.slice(-14).map(day => `
            <tr>
              <td>${new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
              <td>${day.tests}</td>
              <td>${day.violations}</td>
              <td>${day.invalidations}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p>This report was automatically generated by ProvenHire Proctoring System.</p>
        <p>For questions or concerns, please contact the administrator.</p>
      </div>
    </body>
    </html>
  `;
};

/**
 * Open print dialog for PDF export
 */
export const exportToPDF = async (): Promise<void> => {
  const analytics = await getProctoringAnalytics();
  const htmlContent = generatePDFContent(analytics);
  
  // Open in new window for printing
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load then trigger print
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};
