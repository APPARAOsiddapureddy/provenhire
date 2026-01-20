import { supabase } from "@/integrations/supabase/client";

// Send email notification to admins for high-risk alerts
export const sendHighRiskAlertNotification = async (
  alertType: string,
  testType: string,
  userId: string,
  message: string,
  violationDetails?: Record<string, unknown>
): Promise<void> => {
  try {
    await supabase.functions.invoke('send-admin-notification', {
      body: {
        notificationType: 'proctoring_alert',
        subject: `High-Risk Proctoring Alert: ${alertType}`,
        message: message,
        details: {
          'Alert Type': alertType,
          'Test Type': testType === 'aptitude' ? 'Aptitude Test' : 'DSA Round',
          'User ID': userId.slice(0, 8) + '...',
          ...(violationDetails || {})
        }
      }
    });
    console.log('Admin notification sent for high-risk alert');
  } catch (error) {
    console.error('Failed to send admin notification for alert:', error);
    // Don't throw - notification failure shouldn't break the flow
  }
};

export interface UploadRecordingResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const RETAKE_COOLDOWN_HOURS = 24;

/**
 * Upload a screen recording blob to Supabase storage
 */
export const uploadScreenRecording = async (
  userId: string,
  testId: string,
  testType: 'aptitude' | 'dsa',
  recordingBlob: Blob
): Promise<UploadRecordingResult> => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${userId}/${testType}_${testId}_${timestamp}.webm`;

    const { data, error } = await supabase.storage
      .from('proctoring-recordings')
      .upload(fileName, recordingBlob, {
        contentType: 'video/webm',
        upsert: false,
      });

    if (error) {
      console.error('Failed to upload recording:', error);
      return { success: false, error: error.message };
    }

    // Get signed URL for the recording (valid for 7 days)
    const { data: urlData } = await supabase.storage
      .from('proctoring-recordings')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

    return {
      success: true,
      url: urlData?.signedUrl || data?.path,
    };
  } catch (error: any) {
    console.error('Recording upload error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get a fresh signed URL for a recording
 */
export const getRecordingUrl = async (filePath: string): Promise<string | null> => {
  try {
    const { data } = await supabase.storage
      .from('proctoring-recordings')
      .createSignedUrl(filePath, 60 * 60); // 1 hour

    return data?.signedUrl || null;
  } catch (error) {
    console.error('Failed to get recording URL:', error);
    return null;
  }
};

/**
 * Send invalidation email notification to candidate
 */
export const sendInvalidationEmail = async (
  userId: string,
  testType: 'aptitude' | 'dsa',
  reason: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Get user's email from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('user_id', userId)
      .single();

    if (!profile?.email) {
      console.log('No email found for user, skipping notification');
      return { success: true }; // Don't fail if no email
    }

    const { error } = await supabase.functions.invoke('send-invalidation-notification', {
      body: {
        candidateEmail: profile.email,
        candidateName: profile.full_name || 'Candidate',
        testType,
        invalidationReason: reason,
        cooldownHours: RETAKE_COOLDOWN_HOURS,
      },
    });

    if (error) {
      console.error('Failed to send invalidation email:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending invalidation email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Invalidate a test result
 */
export const invalidateTest = async (
  testId: string,
  testType: 'aptitude' | 'dsa',
  reason: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const table = testType === 'aptitude' ? 'aptitude_test_results' : 'dsa_round_results';
    
    const { error } = await supabase
      .from(table)
      .update({
        is_invalidated: true,
        invalidated_at: new Date().toISOString(),
        invalidation_reason: reason,
        passed: false, // Mark as failed when invalidated
      })
      .eq('id', testId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Get the user ID for this test
    const { data: testData } = await supabase
      .from(table)
      .select('user_id')
      .eq('id', testId)
      .single();

    if (testData?.user_id) {
      const stageName = testType === 'aptitude' ? 'aptitude_test' : 'dsa_round';
      
      // Update the verification stage to failed
      await supabase
        .from('verification_stages')
        .update({ 
          status: 'failed',
          completed_at: null,
        })
        .eq('user_id', testData.user_id)
        .eq('stage_name', stageName);

      // Send email notification
      await sendInvalidationEmail(testData.user_id, testType, reason);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * Check if user is in cooldown period for a test type
 */
export const checkCooldownStatus = async (
  userId: string,
  testType: 'aptitude' | 'dsa'
): Promise<{ inCooldown: boolean; cooldownEndsAt?: Date; hoursRemaining?: number }> => {
  try {
    const table = testType === 'aptitude' ? 'aptitude_test_results' : 'dsa_round_results';
    
    // Get the most recent invalidated test for this user
    const { data: invalidatedTest } = await supabase
      .from(table)
      .select('invalidated_at')
      .eq('user_id', userId)
      .eq('is_invalidated', true)
      .order('invalidated_at', { ascending: false })
      .limit(1)
      .single();

    if (!invalidatedTest?.invalidated_at) {
      return { inCooldown: false };
    }

    const invalidatedAt = new Date(invalidatedTest.invalidated_at);
    const cooldownEndsAt = new Date(invalidatedAt.getTime() + RETAKE_COOLDOWN_HOURS * 60 * 60 * 1000);
    const now = new Date();

    if (now < cooldownEndsAt) {
      const hoursRemaining = Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / (60 * 60 * 1000));
      return { 
        inCooldown: true, 
        cooldownEndsAt, 
        hoursRemaining 
      };
    }

    return { inCooldown: false };
  } catch (error) {
    console.error('Error checking cooldown status:', error);
    return { inCooldown: false };
  }
};

/**
 * Check if a user has an invalidated test that needs retake
 */
export const checkInvalidatedTests = async (
  userId: string
): Promise<{ aptitude: boolean; dsa: boolean }> => {
  const result = { aptitude: false, dsa: false };

  try {
    // Check aptitude tests
    const { data: aptitudeData } = await supabase
      .from('aptitude_test_results')
      .select('is_invalidated')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(1);

    if (aptitudeData?.[0]?.is_invalidated) {
      result.aptitude = true;
    }

    // Check DSA tests
    const { data: dsaData } = await supabase
      .from('dsa_round_results')
      .select('is_invalidated')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(1);

    if (dsaData?.[0]?.is_invalidated) {
      result.dsa = true;
    }
  } catch (error) {
    console.error('Error checking invalidated tests:', error);
  }

  return result;
};

/**
 * Get proctoring analytics data for admin dashboard
 */
export const getProctoringAnalytics = async (): Promise<{
  dailyStats: { date: string; violations: number; invalidations: number; tests: number }[];
  violationTypes: { type: string; count: number }[];
  totalStats: { 
    totalTests: number; 
    totalViolations: number; 
    totalInvalidations: number; 
    violationRate: number;
    invalidationRate: number;
  };
}> => {
  try {
    // Fetch all test results from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [aptitudeResult, dsaResult] = await Promise.all([
      supabase
        .from('aptitude_test_results')
        .select('*')
        .gte('completed_at', thirtyDaysAgo.toISOString())
        .order('completed_at', { ascending: true }),
      supabase
        .from('dsa_round_results')
        .select('*')
        .gte('completed_at', thirtyDaysAgo.toISOString())
        .order('completed_at', { ascending: true }),
    ]);

    const allTests = [
      ...(aptitudeResult.data || []).map(t => ({ ...t, testType: 'aptitude' })),
      ...(dsaResult.data || []).map(t => ({ ...t, testType: 'dsa' })),
    ];

    // Calculate daily stats
    const dailyStatsMap = new Map<string, { violations: number; invalidations: number; tests: number }>();
    
    // Initialize last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyStatsMap.set(dateStr, { violations: 0, invalidations: 0, tests: 0 });
    }

    // Violation type counters
    const violationTypes = {
      'Tab Switches': 0,
      'Face Detection': 0,
      'Audio Violations': 0,
      'Multiple Faces': 0,
      'No Face Detected': 0,
    };

    let totalViolations = 0;
    let totalInvalidations = 0;

    allTests.forEach((test: any) => {
      const dateStr = new Date(test.completed_at).toISOString().split('T')[0];
      const stats = dailyStatsMap.get(dateStr) || { violations: 0, invalidations: 0, tests: 0 };
      
      stats.tests++;
      
      if (test.is_invalidated) {
        stats.invalidations++;
        totalInvalidations++;
      }

      // Parse proctoring data
      const answers = test.answers || test.solutions;
      const proctoring = answers?.proctoring || answers?.antiCheatData;
      
      if (proctoring) {
        const tabSwitches = proctoring.tabSwitchCount || 0;
        const faceViolations = proctoring.faceViolations || 0;
        const audioViolations = proctoring.audioViolations || 0;
        
        if (tabSwitches > 0 || faceViolations > 0 || audioViolations > 0) {
          stats.violations++;
          totalViolations++;
        }

        violationTypes['Tab Switches'] += tabSwitches;
        violationTypes['Face Detection'] += faceViolations;
        violationTypes['Audio Violations'] += audioViolations;

        // Count specific violations from violation array
        (proctoring.violations || []).forEach((v: string) => {
          if (v.toLowerCase().includes('multiple face')) {
            violationTypes['Multiple Faces']++;
          } else if (v.toLowerCase().includes('no face')) {
            violationTypes['No Face Detected']++;
          }
        });
      }

      dailyStatsMap.set(dateStr, stats);
    });

    // Convert to array and sort by date
    const dailyStats = Array.from(dailyStatsMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const violationTypeArray = Object.entries(violationTypes)
      .map(([type, count]) => ({ type, count }))
      .filter(v => v.count > 0)
      .sort((a, b) => b.count - a.count);

    const totalTests = allTests.length;

    return {
      dailyStats,
      violationTypes: violationTypeArray,
      totalStats: {
        totalTests,
        totalViolations,
        totalInvalidations,
        violationRate: totalTests > 0 ? Math.round((totalViolations / totalTests) * 100) : 0,
        invalidationRate: totalTests > 0 ? Math.round((totalInvalidations / totalTests) * 100) : 0,
      },
    };
  } catch (error) {
    console.error('Error fetching proctoring analytics:', error);
    return {
      dailyStats: [],
      violationTypes: [],
      totalStats: { 
        totalTests: 0, 
        totalViolations: 0, 
        totalInvalidations: 0, 
        violationRate: 0,
        invalidationRate: 0,
      },
    };
  }
};
