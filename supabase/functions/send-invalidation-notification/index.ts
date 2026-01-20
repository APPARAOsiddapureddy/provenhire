import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvalidationNotificationRequest {
  candidateEmail: string;
  candidateName: string;
  testType: "aptitude" | "dsa";
  invalidationReason: string;
  cooldownHours: number;
  testId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    // Verify JWT and get user claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    // Verify user is an admin or recruiter
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (roleError || !roleData || (roleData.role !== 'recruiter' && roleData.role !== 'admin')) {
      console.error("Unauthorized role:", roleData?.role);
      return new Response(
        JSON.stringify({ error: 'Only recruiters and admins can send invalidation notifications' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { 
      candidateEmail, 
      candidateName,
      testType,
      invalidationReason,
      cooldownHours = 24,
      testId
    }: InvalidationNotificationRequest = await req.json();

    // Validate testId exists
    if (!testId) {
      return new Response(
        JSON.stringify({ error: 'Test ID is required' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending invalidation notification to ${candidateEmail}`);
    console.log(`Test Type: ${testType}, Reason: ${invalidationReason}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const testTypeName = testType === "aptitude" ? "Aptitude Test" : "DSA Round";
    const subject = `⚠️ Test Invalidated - ${testTypeName} Requires Retake`;
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Test Invalidated ⚠️</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <p style="font-size: 16px; color: #374151;">Hi ${candidateName || "Candidate"},</p>
          <p style="font-size: 16px; color: #374151;">
            We regret to inform you that your <strong>${testTypeName}</strong> has been invalidated 
            due to proctoring violations detected during your test session.
          </p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3 style="margin: 0 0 10px 0; color: #374151;">Reason for Invalidation:</h3>
            <p style="margin: 0; color: #6b7280;">${invalidationReason}</p>
          </div>

          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h3 style="margin: 0 0 10px 0; color: #374151;">Next Steps:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #6b7280;">
              <li style="margin-bottom: 8px;">You may retake the test after a <strong>${cooldownHours}-hour</strong> cooldown period.</li>
              <li style="margin-bottom: 8px;">Ensure you are in a quiet, well-lit environment during the test.</li>
              <li style="margin-bottom: 8px;">Keep your face visible to the camera at all times.</li>
              <li style="margin-bottom: 8px;">Do not switch tabs or leave the test window.</li>
              <li style="margin-bottom: 8px;">Do not use external assistance or resources.</li>
            </ol>
          </div>

          <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e;">
              <strong>⏰ Important:</strong> Your cooldown period will end approximately ${cooldownHours} hours 
              from the time of invalidation. After this period, you can attempt the test again.
            </p>
          </div>

          <p style="font-size: 16px; color: #374151;">
            We understand this may be frustrating, but our proctoring system helps ensure fairness 
            for all candidates. If you believe this was a mistake, please contact our support team.
          </p>
          
          <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
            Best regards,<br>
            The ProvenHire Team
          </p>
        </div>
        <div style="background: #f3f4f6; padding: 20px; text-align: center;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            If you have questions, please reply to this email or contact support.
          </p>
        </div>
      </div>
    `;

    // Send email using Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ProvenHire <onboarding@resend.dev>",
        to: [candidateEmail],
        subject: subject,
        html: emailContent,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Email send error:", emailResult);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: emailResult }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Invalidation notification sent successfully:", emailResult);

    return new Response(JSON.stringify({ success: true, emailResponse: emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-invalidation-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
