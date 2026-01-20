import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReferralNotificationRequest {
  referralCode: string;
  referredUserName: string;
  referredUserEmail: string;
  referredUserId: string;
}

// Rate limiting: Track recent requests by referral code
const recentRequests = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(referralCode: string): boolean {
  const now = Date.now();
  const requests = recentRequests.get(referralCode) || [];
  
  // Clean up old requests
  const validRequests = requests.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  
  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  validRequests.push(now);
  recentRequests.set(referralCode, validRequests);
  return false;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { referralCode, referredUserName, referredUserEmail, referredUserId }: ReferralNotificationRequest = await req.json();

    console.log("Processing referral notification:", { referralCode, referredUserName, referredUserId });

    // Validate referral code format
    if (!referralCode || !referralCode.startsWith('PH-') || referralCode.length !== 11) {
      return new Response(
        JSON.stringify({ error: "Invalid referral code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate referred user ID
    if (!referredUserId || typeof referredUserId !== 'string' || referredUserId.length < 32) {
      return new Response(
        JSON.stringify({ error: "Invalid referred user ID" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting check
    if (isRateLimited(referralCode)) {
      console.log("Rate limited for referral code:", referralCode);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use the existing database function to get the referrer's user ID from the referral code
    // This is more secure than pattern matching
    const { data: referrerUserId, error: lookupError } = await supabase
      .rpc('get_user_id_from_referral_code', { code: referralCode });

    if (lookupError || !referrerUserId) {
      console.log("Referrer not found for code:", referralCode, lookupError);
      return new Response(
        JSON.stringify({ error: "Referrer not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get referrer's profile data
    const { data: referrerData, error: referrerError } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .eq('user_id', referrerUserId)
      .single();

    if (referrerError || !referrerData) {
      console.log("Referrer profile not found:", referrerError);
      return new Response(
        JSON.stringify({ error: "Referrer profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Found referrer:", referrerData.user_id);

    // Check if this referral already exists (idempotency check)
    const { data: existingReferral } = await supabase
      .from('referrals')
      .select('id')
      .eq('referrer_id', referrerData.user_id)
      .eq('referred_user_id', referredUserId)
      .single();

    if (existingReferral) {
      console.log("Referral already exists, skipping duplicate");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Referral already processed",
          referrerId: referrerData.user_id 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create the referral record
    const { error: referralInsertError } = await supabase
      .from('referrals')
      .insert({
        referrer_id: referrerData.user_id,
        referred_user_id: referredUserId,
        referral_code: referralCode,
        status: 'signed_up'
      });

    if (referralInsertError) {
      // If duplicate, it's already tracked
      if (referralInsertError.code === '23505') {
        console.log("Referral already exists for this user");
      } else {
        console.error("Error creating referral record:", referralInsertError);
      }
    }

    // Update the referred user's profile with the referral code
    await supabase
      .from('profiles')
      .update({ referred_by_code: referralCode })
      .eq('user_id', referredUserId);

    // Get current referral count and increment atomically
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('referral_count')
      .eq('user_id', referrerData.user_id)
      .single();

    const newCount = (currentProfile?.referral_count || 0) + 1;
    
    await supabase
      .from('profiles')
      .update({ referral_count: newCount })
      .eq('user_id', referrerData.user_id);

    // Also trigger SMS notification (non-blocking)
    try {
      const smsResponse = await fetch(`${supabaseUrl}/functions/v1/send-referral-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          referralCode,
          referredUserName,
          referredUserId
        }),
      });
      if (smsResponse.ok) {
        console.log("SMS notification triggered successfully");
      }
    } catch (smsError) {
      console.log("SMS notification failed (non-critical):", smsError);
    }

    // Send email notification to the referrer using Resend
    if (referrerData.email && resendApiKey) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Great News!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your friend just joined ProvenHire</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hi ${referrerData.full_name || 'there'}! 👋</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 16px;">
                <strong>${referredUserName || 'Someone'}</strong> has signed up using your referral code!
              </p>
            </div>
            
            <p style="font-size: 15px; color: #555;">
              Once they complete their verification process, both of you will receive:
            </p>
            
            <ul style="color: #555; padding-left: 20px;">
              <li style="margin-bottom: 8px;">🌟 Priority profile visibility to recruiters</li>
              <li style="margin-bottom: 8px;">🏅 Featured badge on your Skill Passport</li>
              <li style="margin-bottom: 8px;">💼 Exclusive access to premium job listings</li>
            </ul>
            
            <div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin-top: 20px;">
              <p style="margin: 0; font-size: 14px; color: #1a73e8;">
                <strong>Keep sharing!</strong> The more friends you refer, the more benefits you unlock.
              </p>
            </div>
          </div>
          
          <p style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
            © 2025 ProvenHire. All rights reserved.
          </p>
        </body>
        </html>
      `;

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "ProvenHire <onboarding@resend.dev>",
            to: [referrerData.email],
            subject: `🎉 ${referredUserName || 'A friend'} just signed up with your referral!`,
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          console.log("Referral notification email sent successfully");
        } else {
          const errorData = await emailResponse.text();
          console.error("Failed to send email:", errorData);
        }
      } catch (emailError) {
        console.error("Failed to send referral notification email:", emailError);
        // Don't fail the whole request if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Referral tracked and notification sent",
        referrerId: referrerData.user_id 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-referral-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
