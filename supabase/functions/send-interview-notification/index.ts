import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InterviewNotificationRequest {
  sessionId: string;
  userId: string;
  candidateName: string;
  candidateEmail: string;
  overallScore: number;
  isFlagged: boolean;
  flagReasons?: string[];
  questionsAnswered: number;
  totalQuestions: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      sessionId,
      userId,
      candidateName,
      candidateEmail,
      overallScore,
      isFlagged,
      flagReasons,
      questionsAnswered,
      totalQuestions,
    }: InterviewNotificationRequest = await req.json();

    console.log("Sending interview notification for session:", sessionId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin emails
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminEmails: string[] = [];
    if (adminRoles && adminRoles.length > 0) {
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("email")
        .in("user_id", adminRoles.map(r => r.user_id));
      
      if (adminProfiles) {
        adminEmails.push(...adminProfiles.map(p => p.email).filter(Boolean));
      }
    }

    const passed = overallScore >= 60 && !isFlagged;
    const scoreColor = overallScore >= 75 ? "#22c55e" : overallScore >= 60 ? "#eab308" : "#ef4444";
    const statusText = passed ? "Passed" : isFlagged ? "Flagged for Review" : "Did Not Pass";
    const statusColor = passed ? "#22c55e" : isFlagged ? "#f59e0b" : "#ef4444";

    // Send notification to candidate
    const candidateEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">AI Interview Complete</h1>
            </div>
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
                Hi ${candidateName || "there"},
              </p>
              <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
                Thank you for completing your AI-powered interview! Here's a summary of your results:
              </p>
              
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 48px; font-weight: bold; color: ${scoreColor}; margin-bottom: 8px;">
                  ${overallScore}%
                </div>
                <div style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">
                  Overall Score
                </div>
                <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background-color: ${statusColor}; color: white; font-size: 14px; font-weight: 600;">
                  ${statusText}
                </div>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
                <p style="color: #374151; font-size: 14px; margin-bottom: 8px;">
                  <strong>Questions Answered:</strong> ${questionsAnswered} of ${totalQuestions}
                </p>
                ${passed ? `
                  <p style="color: #22c55e; font-size: 14px;">
                    🎉 Congratulations! You've successfully completed the verification process.
                  </p>
                ` : isFlagged ? `
                  <p style="color: #f59e0b; font-size: 14px;">
                    ⚠️ Your responses are under review. Our team will evaluate and get back to you.
                  </p>
                ` : `
                  <p style="color: #6b7280; font-size: 14px;">
                    Your interview is being reviewed. You may be contacted for next steps.
                  </p>
                `}
              </div>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                ProvenHire - Verified Talent Platform
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send to candidate
    if (candidateEmail) {
      const { error: candidateError } = await resend.emails.send({
        from: "ProvenHire <onboarding@resend.dev>",
        to: [candidateEmail],
        subject: `AI Interview Complete - ${statusText}`,
        html: candidateEmailHtml,
      });

      if (candidateError) {
        console.error("Failed to send candidate email:", candidateError);
      } else {
        console.log("Candidate notification sent to:", candidateEmail);
      }
    }

    // Send admin notification for flagged responses
    if (isFlagged && adminEmails.length > 0) {
      const adminEmailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); padding: 32px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Flagged Interview Alert</h1>
              </div>
              <div style="padding: 32px;">
                <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
                  An AI interview has been flagged for review.
                </p>
                
                <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                  <h3 style="color: #92400e; margin: 0 0 12px 0; font-size: 16px;">Candidate Details</h3>
                  <p style="color: #78350f; margin: 4px 0; font-size: 14px;">
                    <strong>Name:</strong> ${candidateName || "Not provided"}
                  </p>
                  <p style="color: #78350f; margin: 4px 0; font-size: 14px;">
                    <strong>Email:</strong> ${candidateEmail || "Not provided"}
                  </p>
                  <p style="color: #78350f; margin: 4px 0; font-size: 14px;">
                    <strong>Session ID:</strong> ${sessionId}
                  </p>
                </div>
                
                <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                  <div style="font-size: 36px; font-weight: bold; color: ${scoreColor}; margin-bottom: 8px;">
                    ${overallScore}%
                  </div>
                  <div style="color: #6b7280; font-size: 14px;">
                    Overall Score (${questionsAnswered}/${totalQuestions} questions)
                  </div>
                </div>
                
                ${flagReasons && flagReasons.length > 0 ? `
                  <div style="background-color: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                    <h3 style="color: #991b1b; margin: 0 0 12px 0; font-size: 16px;">Flag Reasons</h3>
                    <ul style="color: #7f1d1d; margin: 0; padding-left: 20px; font-size: 14px;">
                      ${flagReasons.map(reason => `<li style="margin-bottom: 4px;">${reason}</li>`).join("")}
                    </ul>
                  </div>
                ` : ""}
                
                <div style="text-align: center;">
                  <p style="color: #6b7280; font-size: 14px;">
                    Please review this interview in the admin dashboard.
                  </p>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  ProvenHire Admin Notification
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const { error: adminError } = await resend.emails.send({
        from: "ProvenHire Alerts <onboarding@resend.dev>",
        to: adminEmails,
        subject: `⚠️ Flagged Interview: ${candidateName || "Unknown Candidate"} - Score: ${overallScore}%`,
        html: adminEmailHtml,
      });

      if (adminError) {
        console.error("Failed to send admin notification:", adminError);
      } else {
        console.log("Admin notification sent to:", adminEmails.join(", "));
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-interview-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
