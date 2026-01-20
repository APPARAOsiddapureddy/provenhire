import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AdminNotificationRequest {
  notificationType: 'proctoring_alert' | 'appeal_submitted';
  subject: string;
  message: string;
  details?: Record<string, unknown>;
}

const handler = async (req: Request): Promise<Response> => {
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

    // Verify user has a valid role (jobseeker can trigger alerts, recruiter/admin can send notifications)
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

    if (roleError || !roleData) {
      console.error("Role error:", roleError);
      return new Response(
        JSON.stringify({ error: 'User role not found' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { notificationType, subject, message, details }: AdminNotificationRequest = await req.json();

    console.log("Received admin notification request:", { notificationType, subject, userId });

    // Fetch all admin/recruiter emails from profiles table
    const { data: recruiters, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'recruiter');

    if (fetchError) {
      console.error("Error fetching recruiters:", fetchError);
      throw fetchError;
    }

    if (!recruiters || recruiters.length === 0) {
      console.log("No recruiters found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get recruiter emails from profiles
    const recruiterIds = recruiters.map(r => r.user_id);
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .in('user_id', recruiterIds);

    if (profileError) {
      console.error("Error fetching profiles:", profileError);
      throw profileError;
    }

    const adminEmails = profiles?.filter(p => p.email).map(p => p.email) || [];
    
    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending notification to ${adminEmails.length} admin(s)`);

    // Build email HTML based on notification type
    const alertColor = notificationType === 'proctoring_alert' ? '#ef4444' : '#f59e0b';
    const alertIcon = notificationType === 'proctoring_alert' ? '🚨' : '📝';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 32px; text-align: center; background-color: ${alertColor}; border-radius: 12px 12px 0 0;">
                    <span style="font-size: 48px;">${alertIcon}</span>
                    <h1 style="margin: 16px 0 0 0; font-size: 24px; color: white; font-weight: 600;">
                      ${notificationType === 'proctoring_alert' ? 'High-Risk Alert' : 'New Appeal Submitted'}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #18181b;">
                      ${subject}
                    </h2>
                    <p style="margin: 0 0 24px 0; font-size: 16px; color: #52525b; line-height: 1.6;">
                      ${message}
                    </p>
                    ${details ? `
                      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f5; border-radius: 8px;">
                        <tr>
                          <td style="padding: 16px;">
                            <p style="margin: 0; font-size: 12px; color: #71717a; text-transform: uppercase; font-weight: 600;">Details</p>
                            ${Object.entries(details).map(([key, value]) => `
                              <p style="margin: 8px 0 0 0; font-size: 14px; color: #18181b;">
                                <strong>${key}:</strong> ${value}
                              </p>
                            `).join('')}
                          </td>
                        </tr>
                      </table>
                    ` : ''}
                    <div style="margin-top: 32px; text-align: center;">
                      <p style="margin: 0; font-size: 14px; color: #71717a;">
                        Please log in to the admin dashboard to review and take action.
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px; text-align: center; border-top: 1px solid #e4e4e7;">
                    <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                      ProvenHire Admin Notification System
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Send email to all admins
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "ProvenHire <onboarding@resend.dev>",
        to: adminEmails,
        subject: `[ProvenHire] ${subject}`,
        html: htmlContent,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      throw new Error(emailResult.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailResult);

    return new Response(
      JSON.stringify({ success: true, emailsSent: adminEmails.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-admin-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
