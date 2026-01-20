import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SMSNotificationRequest {
  referralCode: string;
  referredUserName: string;
  referredUserId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { referralCode, referredUserName, referredUserId }: SMSNotificationRequest = await req.json();

    console.log("Processing SMS referral notification:", { referralCode, referredUserName, referredUserId });

    if (!referralCode || !referralCode.startsWith('PH-')) {
      return new Response(
        JSON.stringify({ error: "Invalid referral code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if Twilio is configured
    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.log("Twilio not configured, skipping SMS notification");
      return new Response(
        JSON.stringify({ success: true, message: "SMS notification skipped - Twilio not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Extract the short id from the referral code (PH-XXXXXXXX format)
    const shortId = referralCode.substring(3, 11).toLowerCase();

    // Find the referrer by matching the user id prefix
    const { data: referrerData, error: referrerError } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone')
      .ilike('user_id', `${shortId}%`)
      .single();

    if (referrerError || !referrerData) {
      console.log("Referrer not found for code:", referralCode);
      return new Response(
        JSON.stringify({ error: "Referrer not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if referrer has a phone number
    if (!referrerData.phone) {
      console.log("Referrer has no phone number");
      return new Response(
        JSON.stringify({ success: true, message: "SMS notification skipped - no phone number" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Format phone number (ensure it has country code)
    let phoneNumber = referrerData.phone.replace(/\s+/g, '').replace(/-/g, '');
    if (!phoneNumber.startsWith('+')) {
      // Assume India if no country code (you can adjust this logic)
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '+91' + phoneNumber.substring(1);
      } else {
        phoneNumber = '+91' + phoneNumber;
      }
    }

    // Send SMS via Twilio
    const message = `🎉 Great news! ${referredUserName || 'A friend'} just signed up on ProvenHire using your referral code! Once they complete verification, both of you will get priority visibility to recruiters. Keep sharing! - Team ProvenHire`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append('To', phoneNumber);
    formData.append('From', twilioPhoneNumber);
    formData.append('Body', message);

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (twilioResponse.ok) {
      const result = await twilioResponse.json();
      console.log("SMS sent successfully:", result.sid);
      return new Response(
        JSON.stringify({ success: true, message: "SMS notification sent", sid: result.sid }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } else {
      const errorText = await twilioResponse.text();
      console.error("Twilio API error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send SMS" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

  } catch (error: any) {
    console.error("Error in send-referral-sms function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
