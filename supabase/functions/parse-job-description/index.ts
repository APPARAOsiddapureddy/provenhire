import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParseJobDescriptionRequest {
  content: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user for parse-job-description: ${userId}`);

    // Verify user is a recruiter or admin
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
        JSON.stringify({ error: 'Only recruiters can parse job descriptions' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content }: ParseJobDescriptionRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!content || content.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Job description content is too short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit content length to prevent abuse
    const truncatedContent = content.slice(0, 10000);
    console.log("Parsing job description, content length:", truncatedContent.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert job description parser. Extract structured information from job descriptions and return it in a specific format. Be thorough and accurate.`
          },
          {
            role: "user",
            content: `Parse the following job description and extract the relevant fields:\n\n${truncatedContent}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_job_details",
              description: "Extract structured job details from a job description",
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "The job title (e.g., Senior Software Engineer, Product Manager)"
                  },
                  company: {
                    type: "string",
                    description: "Company name if mentioned, otherwise leave empty"
                  },
                  description: {
                    type: "string",
                    description: "A clean, well-formatted job description summarizing responsibilities and role overview"
                  },
                  location: {
                    type: "string",
                    description: "Job location (e.g., San Francisco, CA or Remote)"
                  },
                  job_type: {
                    type: "string",
                    enum: ["Full-time", "Part-time", "Contract", "Internship"],
                    description: "Type of employment"
                  },
                  salary_range: {
                    type: "string",
                    description: "Salary range if mentioned (e.g., $100k - $150k or ₹15L - ₹25L)"
                  },
                  experience_required: {
                    type: "number",
                    description: "Minimum years of experience required (as a number)"
                  },
                  required_skills: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of required technical and soft skills"
                  }
                },
                required: ["title", "description", "required_skills"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_job_details" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the function call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_job_details") {
      throw new Error("Failed to extract job details from AI response");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log("Extracted job data successfully");

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in parse-job-description function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
