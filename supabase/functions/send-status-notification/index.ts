import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatusNotificationRequest {
  applicationId: string;
  newStatus: string;
  jobTitle: string;
  companyName: string;
  candidateEmail: string;
  candidateName: string;
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

    // Verify user is a recruiter
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
        JSON.stringify({ error: 'Only recruiters can send status notifications' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { 
      applicationId, 
      newStatus, 
      jobTitle, 
      companyName, 
      candidateEmail,
      candidateName 
    }: StatusNotificationRequest = await req.json();

    // Validate that the recruiter owns this job application
    const { data: application, error: appError } = await supabaseAdmin
      .from('job_applications')
      .select('job_id, jobs!inner(recruiter_id)')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error("Application not found:", appError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Type assertion for the joined data
    const jobData = application.jobs as unknown as { recruiter_id: string };
    if (jobData.recruiter_id !== userId && roleData.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'You can only update applications for your own jobs' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending status notification for application ${applicationId}`);
    console.log(`Status: ${newStatus}, Email: ${candidateEmail}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine email content based on status
    let subject = "";
    let emailContent = "";

    switch (newStatus) {
      case "interview_scheduled":
        subject = `🎉 Interview Scheduled - ${jobTitle} at ${companyName}`;
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Congratulations! 🎉</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">Hi ${candidateName},</p>
              <p style="font-size: 16px; color: #374151;">
                Great news! <strong>${companyName}</strong> has scheduled an interview with you for the 
                <strong>${jobTitle}</strong> position.
              </p>
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea;">
                <p style="margin: 0; color: #6b7280;">
                  The recruiter will reach out to you shortly with the interview details.
                  Make sure to check your email and phone regularly.
                </p>
              </div>
              <p style="font-size: 16px; color: #374151;">
                Prepare well and good luck! 🍀
              </p>
              <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
                Best regards,<br>
                The ProvenHire Team
              </p>
            </div>
          </div>
        `;
        break;

      case "hired":
        subject = `🎊 Congratulations! You're Hired - ${jobTitle} at ${companyName}`;
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">You're Hired! 🎊</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">Hi ${candidateName},</p>
              <p style="font-size: 16px; color: #374151;">
                We're thrilled to inform you that <strong>${companyName}</strong> has selected you for the 
                <strong>${jobTitle}</strong> position!
              </p>
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
                <p style="margin: 0; color: #6b7280;">
                  The company will contact you soon with the offer details and next steps.
                  This is a huge achievement - congratulations!
                </p>
              </div>
              <p style="font-size: 16px; color: #374151;">
                We wish you all the best in your new role! 🚀
              </p>
              <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
                Best regards,<br>
                The ProvenHire Team
              </p>
            </div>
          </div>
        `;
        break;

      case "rejected":
        subject = `Application Update - ${jobTitle} at ${companyName}`;
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Application Update</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">Hi ${candidateName},</p>
              <p style="font-size: 16px; color: #374151;">
                Thank you for your interest in the <strong>${jobTitle}</strong> position at 
                <strong>${companyName}</strong>.
              </p>
              <p style="font-size: 16px; color: #374151;">
                After careful consideration, the company has decided to move forward with other candidates 
                whose experience more closely matches their current needs.
              </p>
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #6b7280;">
                <p style="margin: 0; color: #6b7280;">
                  Don't be discouraged! Keep applying to other positions on ProvenHire. 
                  The right opportunity is out there waiting for you.
                </p>
              </div>
              <p style="font-size: 16px; color: #374151;">
                We appreciate your effort and wish you success in your job search!
              </p>
              <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
                Best regards,<br>
                The ProvenHire Team
              </p>
            </div>
          </div>
        `;
        break;

      case "reviewing":
        subject = `Application Under Review - ${jobTitle} at ${companyName}`;
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Application Under Review 📋</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">Hi ${candidateName},</p>
              <p style="font-size: 16px; color: #374151;">
                Good news! <strong>${companyName}</strong> is now actively reviewing your application 
                for the <strong>${jobTitle}</strong> position.
              </p>
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #6b7280;">
                  This means your profile caught their attention. Stay patient while they complete their review.
                </p>
              </div>
              <p style="font-size: 16px; color: #374151;">
                We'll notify you as soon as there's an update!
              </p>
              <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
                Best regards,<br>
                The ProvenHire Team
              </p>
            </div>
          </div>
        `;
        break;

      default:
        subject = `Application Status Update - ${jobTitle}`;
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Status Update</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">Hi ${candidateName},</p>
              <p style="font-size: 16px; color: #374151;">
                Your application status for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> 
                has been updated to: <strong>${newStatus}</strong>
              </p>
              <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
                Best regards,<br>
                The ProvenHire Team
              </p>
            </div>
          </div>
        `;
    }

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

    console.log("Email sent successfully:", emailResult);

    return new Response(JSON.stringify({ success: true, emailResponse: emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-status-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
