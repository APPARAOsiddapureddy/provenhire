import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactCandidateRequest {
  candidateUserId: string;
  recruiterMessage?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Contact candidate function invoked");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: recruiter }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !recruiter) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Recruiter authenticated:", recruiter.id);

    // Verify user is a recruiter
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", recruiter.id)
      .single();

    if (roleError || roleData?.role !== "recruiter") {
      console.error("User is not a recruiter:", roleError);
      return new Response(
        JSON.stringify({ error: "Only recruiters can contact candidates" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { candidateUserId, recruiterMessage }: ContactCandidateRequest = await req.json();
    console.log("Contacting candidate:", candidateUserId);

    // Get candidate profile
    const { data: candidateProfile, error: candidateError } = await supabase
      .from("job_seeker_profiles")
      .select("*")
      .eq("user_id", candidateUserId)
      .single();

    if (candidateError || !candidateProfile) {
      console.error("Candidate not found:", candidateError);
      return new Response(
        JSON.stringify({ error: "Candidate not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify candidate is verified
    if (candidateProfile.verification_status !== "verified") {
      console.error("Candidate is not verified");
      return new Response(
        JSON.stringify({ error: "Can only contact verified candidates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get candidate's email from auth.users via profiles table
    const { data: candidateAuth, error: candidateAuthError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", candidateUserId)
      .single();

    if (candidateAuthError || !candidateAuth?.email) {
      console.error("Candidate email not found:", candidateAuthError);
      return new Response(
        JSON.stringify({ error: "Candidate email not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get recruiter's profile info
    const { data: recruiterProfile } = await supabase
      .from("profiles")
      .select("full_name, company_name, email")
      .eq("user_id", recruiter.id)
      .single();

    const recruiterName = recruiterProfile?.full_name || "A recruiter";
    const companyName = recruiterProfile?.company_name || "a company";
    const recruiterEmail = recruiterProfile?.email || recruiter.email;
    const candidateName = candidateAuth.full_name || "Candidate";
    const candidateRole = candidateProfile.actively_looking_roles?.[0] || "your profile";

    console.log(`Sending email to ${candidateAuth.email}`);

    // Send email to candidate using Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ProvenHire <onboarding@resend.dev>",
        to: [candidateAuth.email],
        subject: `🎉 A recruiter from ${companyName} is interested in you!`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .highlight { background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0; }
            .cta-button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Great news, ${candidateName}! 🎉</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">A recruiter is interested in your profile</p>
            </div>
            <div class="content">
              <p>Your verified profile on ProvenHire caught the attention of <strong>${recruiterName}</strong> from <strong>${companyName}</strong>!</p>
              
              <div class="highlight">
                <p style="margin: 0;"><strong>They're interested in:</strong> ${candidateRole}</p>
                ${recruiterMessage ? `<p style="margin: 10px 0 0 0;"><strong>Message:</strong> "${recruiterMessage}"</p>` : ''}
              </div>

              <p>Your skills and experience stood out because you're a verified candidate. Companies trust ProvenHire's verification process.</p>

              <p><strong>What's next?</strong></p>
              <ul>
                <li>You can expect the recruiter to reach out via email at: <strong>${recruiterEmail}</strong></li>
                <li>Make sure your profile is up to date</li>
                <li>Prepare for potential interview opportunities</li>
              </ul>

              <p>Keep up the great work! 🚀</p>
              
              <div class="footer">
                <p>This email was sent by ProvenHire because a recruiter expressed interest in your profile.</p>
                <p>© ${new Date().getFullYear()} ProvenHire. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      }),
    });

    const emailData = await emailResponse.json();
    console.log("Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Candidate has been notified of your interest" 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in contact-candidate function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
