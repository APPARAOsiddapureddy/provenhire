import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobAlertRequest {
  jobId: string;
  jobTitle: string;
  company: string;
  requiredSkills: string[];
  location: string | null;
  salaryRange: string | null;
  jobType: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication - either via JWT or service role for cron jobs
    const authHeader = req.headers.get('Authorization');
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Supabase credentials not configured");
      return new Response(
        JSON.stringify({ error: "Database service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if this is a cron job call (with service role) or user call (with JWT)
    let isAuthorized = false;
    let callerUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      
      // Check if it's the service role key
      if (token === SUPABASE_SERVICE_ROLE_KEY) {
        isAuthorized = true;
        console.log("Authorized via service role key (cron job)");
      } else {
        // Verify JWT for regular user
        const supabase = createClient(SUPABASE_URL, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false }
        });

        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        
        if (!claimsError && claimsData?.claims) {
          callerUserId = claimsData.claims.sub as string;
          
          // Verify user is a recruiter
          const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
          });

          const { data: roleData } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('user_id', callerUserId)
            .single();

          if (roleData && (roleData.role === 'recruiter' || roleData.role === 'admin')) {
            isAuthorized = true;
            console.log(`Authorized user: ${callerUserId}`);
          }
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { jobId, jobTitle, company, requiredSkills, location, salaryRange, jobType }: JobAlertRequest = await req.json();

    console.log(`Processing job alerts for new job: ${jobTitle} at ${company}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all active subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('job_alert_subscriptions')
      .select('*')
      .eq('is_active', true);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No active subscriptions found");
      return new Response(JSON.stringify({ success: true, emailsSent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const normalizedJobSkills = requiredSkills.map(s => s.toLowerCase().trim());
    let emailsSent = 0;

    for (const sub of subscriptions) {
      const userSkills = sub.skills.map((s: string) => s.toLowerCase().trim());
      
      // Calculate match percentage
      const matchedSkills = normalizedJobSkills.filter(jobSkill =>
        userSkills.some((userSkill: string) => 
          userSkill.includes(jobSkill) || jobSkill.includes(userSkill)
        )
      );
      
      const matchPercentage = normalizedJobSkills.length > 0 
        ? Math.round((matchedSkills.length / normalizedJobSkills.length) * 100)
        : 0;

      if (matchPercentage >= sub.min_match_percentage) {
        console.log(`Sending alert to ${sub.email} - ${matchPercentage}% match`);

        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">New Job Match! 🎯</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">
                We found a job that matches <strong>${matchPercentage}%</strong> of your skills!
              </p>
              
              <div style="background: white; border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid #e5e7eb;">
                <h2 style="color: #111827; margin: 0 0 8px 0;">${jobTitle}</h2>
                <p style="color: #6b7280; margin: 0 0 16px 0;">${company}</p>
                
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
                  ${location ? `<span style="background: #f3f4f6; padding: 4px 12px; border-radius: 20px; font-size: 14px; color: #4b5563;">📍 ${location}</span>` : ''}
                  ${jobType ? `<span style="background: #f3f4f6; padding: 4px 12px; border-radius: 20px; font-size: 14px; color: #4b5563;">💼 ${jobType}</span>` : ''}
                  ${salaryRange ? `<span style="background: #f3f4f6; padding: 4px 12px; border-radius: 20px; font-size: 14px; color: #4b5563;">💰 ${salaryRange}</span>` : ''}
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
                  <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">Required Skills:</p>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${requiredSkills.slice(0, 8).map(skill => {
                      const isMatched = matchedSkills.includes(skill.toLowerCase().trim());
                      return `<span style="background: ${isMatched ? '#dcfce7' : '#fef3c7'}; color: ${isMatched ? '#166534' : '#92400e'}; padding: 4px 10px; border-radius: 6px; font-size: 12px;">${isMatched ? '✓ ' : ''}${skill}</span>`;
                    }).join('')}
                    ${requiredSkills.length > 8 ? `<span style="color: #6b7280; font-size: 12px; padding: 4px;">+${requiredSkills.length - 8} more</span>` : ''}
                  </div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 24px 0;">
                <a href="https://provenhire.lovable.app/jobs" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">View Job & Apply</a>
              </div>
              
              <p style="font-size: 14px; color: #9ca3af; text-align: center; margin-top: 30px;">
                You're receiving this because you enabled job alerts on ProvenHire.<br>
                <a href="https://provenhire.lovable.app/dashboard/jobseeker" style="color: #6b7280;">Manage your preferences</a>
              </p>
            </div>
          </div>
        `;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "ProvenHire <onboarding@resend.dev>",
            to: [sub.email],
            subject: `🎯 ${matchPercentage}% Match: ${jobTitle} at ${company}`,
            html: emailContent,
          }),
        });

        if (emailResponse.ok) {
          emailsSent++;
          
          // Update last_sent_at
          await supabase
            .from('job_alert_subscriptions')
            .update({ last_sent_at: new Date().toISOString() })
            .eq('id', sub.id);
        } else {
          const error = await emailResponse.json();
          console.error(`Failed to send email to ${sub.email}:`, error);
        }
      }
    }

    console.log(`Job alerts completed. Sent ${emailsSent} emails.`);

    return new Response(JSON.stringify({ success: true, emailsSent }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-job-alerts function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
