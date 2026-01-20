import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication - only service role can call this (for cron jobs)
    const authHeader = req.headers.get('Authorization');
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Supabase credentials not configured");
      return new Response(
        JSON.stringify({ error: "Database service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify the request is from service role or cron
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Check if it's the service role key or admin user
    let isAuthorized = false;
    
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      isAuthorized = true;
      console.log("Authorized via service role key (cron job)");
    } else {
      // For user calls, verify they are admin
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const supabase = createClient(SUPABASE_URL, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false }
      });

      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      
      if (!claimsError && claimsData?.claims) {
        const userId = claimsData.claims.sub as string;
        
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false }
        });

        const { data: roleData } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .single();

        if (roleData?.role === 'admin') {
          isAuthorized = true;
          console.log(`Authorized admin user: ${userId}`);
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Only admins or cron jobs can trigger digests' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Starting daily job digest processing...");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all active daily subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('job_alert_subscriptions')
      .select('*')
      .eq('is_active', true)
      .eq('frequency', 'daily');

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No active daily subscriptions found");
      return new Response(JSON.stringify({ success: true, emailsSent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get jobs posted in the last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: recentJobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'active')
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false });

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      throw jobsError;
    }

    if (!recentJobs || recentJobs.length === 0) {
      console.log("No new jobs in the past 24 hours");
      return new Response(JSON.stringify({ success: true, emailsSent: 0, message: "No new jobs" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Found ${recentJobs.length} jobs from the past 24 hours`);
    let emailsSent = 0;

    for (const sub of subscriptions) {
      const userSkills = sub.skills.map((s: string) => s.toLowerCase().trim());
      
      // Find matching jobs for this user
      const matchingJobs = recentJobs.map(job => {
        const jobSkills = (job.required_skills || []).map((s: string) => s.toLowerCase().trim());
        const matchedSkills = jobSkills.filter((jobSkill: string) =>
          userSkills.some((userSkill: string) => 
            userSkill.includes(jobSkill) || jobSkill.includes(userSkill)
          )
        );
        const matchPercentage = jobSkills.length > 0 
          ? Math.round((matchedSkills.length / jobSkills.length) * 100)
          : 0;
        
        return { ...job, matchPercentage, matchedSkills };
      })
      .filter(job => job.matchPercentage >= sub.min_match_percentage)
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 10); // Top 10 matches

      if (matchingJobs.length === 0) {
        console.log(`No matching jobs for ${sub.email}`);
        continue;
      }

      console.log(`Sending daily digest with ${matchingJobs.length} jobs to ${sub.email}`);

      const jobCards = matchingJobs.map(job => `
        <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="color: #111827; margin: 0 0 4px 0; font-size: 16px;">${job.title}</h3>
              <p style="color: #6b7280; margin: 0; font-size: 14px;">${job.company}</p>
            </div>
            <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">${job.matchPercentage}% match</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
            ${job.location ? `<span style="background: #f3f4f6; padding: 3px 10px; border-radius: 16px; font-size: 12px; color: #4b5563;">📍 ${job.location}</span>` : ''}
            ${job.job_type ? `<span style="background: #f3f4f6; padding: 3px 10px; border-radius: 16px; font-size: 12px; color: #4b5563;">💼 ${job.job_type}</span>` : ''}
            ${job.salary_range ? `<span style="background: #f3f4f6; padding: 3px 10px; border-radius: 16px; font-size: 12px; color: #4b5563;">💰 ${job.salary_range}</span>` : ''}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${(job.required_skills || []).slice(0, 5).map((skill: string) => {
              const isMatched = job.matchedSkills.includes(skill.toLowerCase().trim());
              return `<span style="background: ${isMatched ? '#dcfce7' : '#f3f4f6'}; color: ${isMatched ? '#166534' : '#6b7280'}; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${skill}</span>`;
            }).join('')}
            ${(job.required_skills || []).length > 5 ? `<span style="color: #9ca3af; font-size: 11px; padding: 2px;">+${job.required_skills.length - 5} more</span>` : ''}
          </div>
        </div>
      `).join('');

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Your Daily Job Digest ☀️</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
              ${matchingJobs.length} new job${matchingJobs.length > 1 ? 's' : ''} matching your skills today
            </p>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 15px; color: #374151; margin-bottom: 24px;">
              Good morning! Here are today's best job opportunities based on your skill profile:
            </p>
            
            ${jobCards}
            
            <div style="text-align: center; margin: 30px 0 20px 0;">
              <a href="https://provenhire.lovable.app/jobs" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Browse All Jobs</a>
            </div>
            
            <p style="font-size: 13px; color: #9ca3af; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              You're receiving this daily digest because you subscribed to job alerts on ProvenHire.<br>
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
          subject: `☀️ Daily Digest: ${matchingJobs.length} matching job${matchingJobs.length > 1 ? 's' : ''} today`,
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
        
        console.log(`Daily digest sent to ${sub.email}`);
      } else {
        const error = await emailResponse.json();
        console.error(`Failed to send digest to ${sub.email}:`, error);
      }
    }

    console.log(`Daily digest completed. Sent ${emailsSent} emails.`);

    return new Response(JSON.stringify({ success: true, emailsSent, totalJobs: recentJobs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-daily-digest function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
