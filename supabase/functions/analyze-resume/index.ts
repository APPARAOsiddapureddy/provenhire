import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    // Verify JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Invalid JWT token:', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log('Authenticated user:', userId);

    const { resumeText } = await req.json();
    
    // Input validation
    if (!resumeText || typeof resumeText !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Resume text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (resumeText.length > 50000) {
      return new Response(
        JSON.stringify({ error: 'Resume text too long (max 50000 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing resume with AI for user:', userId);
    console.log('Resume text length:', resumeText.length);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert resume parser. Your job is to extract structured information from resumes accurately.

IMPORTANT EXTRACTION RULES:
1. Contact: Extract full name from the first line/header. Extract email, phone (with country code), and links (LinkedIn/GitHub/Portfolio/LeetCode). If multiple links exist, map LinkedIn and Portfolio/Website when possible.
2. Skills: Extract ALL technical skills mentioned anywhere - from Technical Skills section, Experience, Projects, etc. Include programming languages, frameworks, tools, databases, platforms.
3. Education: Use the highest/latest degree as primary. Extract college name, degree, field of study, graduation year (end year), and CGPA if listed. Field of study is usually after "in" (e.g., "B.Tech in Computer Science").
4. Experience: Extract current company and current role from the most recent position. If "Present" appears, treat it as current role. Use the most recent employer and title.
5. Experience Years: Calculate based on work experience dates. If still working (e.g., "May 2025 - Present"), calculate from start date to now. Use a rounded integer.
6. Roles: Infer job titles the person is suited for based on experience (e.g., "Business Analyst", "Data Analyst", "Computer Vision Engineer", "IT Security Engineer").
7. Projects: Extract project names with descriptions and technologies used.
8. Certifications & Languages: Extract certifications and spoken/programming languages where listed.
9. Bio: Create a 2-3 sentence professional summary based on experience and skills.
10. Location: Extract location if mentioned in header/contact (city, state, country).

Formatting rules:
- Return empty strings for unknown scalar fields and empty arrays for unknown lists.
- Do not invent data. Use reasonable inference only for roles and bio.`
          },
          {
            role: 'user',
            content: `Parse this resume and extract all relevant information:

${resumeText}

Extract and return the data in the exact format specified.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_resume_data",
              description: "Extract structured data from a resume",
              parameters: {
                type: "object",
                properties: {
                  full_name: {
                    type: "string",
                    description: "Candidate full name"
                  },
                  email: {
                    type: "string",
                    description: "Primary email address"
                  },
                  linkedin_url: {
                    type: "string",
                    description: "LinkedIn profile URL if available"
                  },
                  portfolio_url: {
                    type: "string",
                    description: "Portfolio/website URL if available"
                  },
                  phone: { 
                    type: "string",
                    description: "Phone number with country code if available"
                  },
                  location: { 
                    type: "string",
                    description: "Location/city or inferred from header"
                  },
                  skills: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "All technical skills: programming languages, frameworks, tools, databases, platforms, etc."
                  },
                  college: { 
                    type: "string",
                    description: "Full name of the educational institution"
                  },
                  degree: {
                    type: "string",
                    description: "Highest/latest degree (e.g., Bachelor's, Master's)"
                  },
                  field_of_study: {
                    type: "string",
                    description: "Major or field of study"
                  },
                  graduation_year: { 
                    type: "number",
                    description: "Year of graduation (end year from education dates)"
                  },
                  cgpa: {
                    type: "string",
                    description: "CGPA/Percentage if listed"
                  },
                  experience_years: { 
                    type: "number",
                    description: "Total years of professional work experience"
                  },
                  current_company: {
                    type: "string",
                    description: "Most recent/current company"
                  },
                  current_role: {
                    type: "string",
                    description: "Most recent/current role title"
                  },
                  notice_period: {
                    type: "string",
                    description: "Notice period if mentioned"
                  },
                  expected_salary: {
                    type: "string",
                    description: "Expected salary if mentioned"
                  },
                  actively_looking_roles: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Job titles/roles the candidate is suited for based on their experience"
                  },
                  projects: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        link: { type: "string" },
                        technologies: { type: "array", items: { type: "string" } }
                      }
                    },
                    description: "Projects with their descriptions and technologies"
                  },
                  hobbies: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Hobbies or interests if mentioned"
                  },
                  certifications: {
                    type: "array",
                    items: { type: "string" },
                    description: "Certifications if mentioned"
                  },
                  languages: {
                    type: "array",
                    items: { type: "string" },
                    description: "Languages (spoken or programming) if explicitly listed"
                  },
                  bio: { 
                    type: "string",
                    description: "2-3 sentence professional summary highlighting key experience and skills"
                  }
                },
                required: ["skills", "experience_years", "college", "graduation_year", "actively_looking_roles", "bio", "phone", "location", "full_name", "email", "current_company", "current_role"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_resume_data" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to analyze resume' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received for user:', userId);

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('No tool call in response:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: 'Invalid AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

    const inferFullName = (text: string) => {
      const firstNonEmpty = text.split('\n').find(line => line.trim().length > 0) || '';
      const cleaned = firstNonEmpty
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
        .replace(/\+?\d[\d\s().-]{7,}/g, '')
        .replace(/\|/g, ' ')
        .trim();
      return cleaned ? normalizeWhitespace(cleaned) : '';
    };

    const inferCurrentRoleCompany = (text: string) => {
      const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
      const experienceIndex = lines.findIndex(line => /experience/i.test(line));
      const searchStart = experienceIndex >= 0 ? experienceIndex + 1 : 0;
      const candidates = lines.slice(searchStart, searchStart + 25);
      for (const line of candidates) {
        const atMatch = line.match(/^(?<role>.+?)\s+at\s+(?<company>.+)$/i);
        if (atMatch?.groups?.role && atMatch?.groups?.company) {
          return {
            role: normalizeWhitespace(atMatch.groups.role),
            company: normalizeWhitespace(atMatch.groups.company),
          };
        }
        const dashMatch = line.match(/^(?<role>.+?)[,\-–—]+\s*(?<company>[^,]+)$/);
        if (dashMatch?.groups?.role && dashMatch?.groups?.company) {
          return {
            role: normalizeWhitespace(dashMatch.groups.role),
            company: normalizeWhitespace(dashMatch.groups.company),
          };
        }
      }
      return { role: '', company: '' };
    };

    if (!extractedData.full_name) {
      extractedData.full_name = inferFullName(resumeText);
    }

    if (!extractedData.current_role || !extractedData.current_company) {
      const inferred = inferCurrentRoleCompany(resumeText);
      extractedData.current_role = extractedData.current_role || inferred.role;
      extractedData.current_company = extractedData.current_company || inferred.company;
    }

    console.log('Resume analysis complete for user:', userId);

    return new Response(
      JSON.stringify({ data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-resume function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
