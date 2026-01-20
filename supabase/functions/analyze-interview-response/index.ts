import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INTERVIEW_QUESTIONS = {
  behavioral: [
    "Tell me about a time when you faced a significant challenge at work or school. How did you handle it?",
    "Describe a situation where you had to work with a difficult team member. What approach did you take?",
    "Give an example of when you had to learn something new quickly. How did you approach it?",
    "Tell me about a time you failed at something. What did you learn from it?",
    "Describe a project you're particularly proud of. What was your contribution?",
  ],
  technical: [
    "Walk me through how you would approach debugging a complex issue in a production system.",
    "Explain your process for designing and implementing a new feature from requirements to deployment.",
    "How do you ensure code quality in your projects? What tools and practices do you use?",
    "Describe your experience with version control and collaboration tools.",
    "How do you stay updated with new technologies and best practices in your field?",
  ],
  non_tech: [
    "Describe how you approach stakeholder communication when priorities change.",
    "How do you measure success in your role? Give an example.",
    "Tell me about a time you improved a process or reduced inefficiency.",
    "How do you analyze data to make a recommendation or decision?",
    "Describe a time you managed competing deadlines successfully.",
  ],
  situational: [
    "If you were given a project with an unrealistic deadline, how would you handle it?",
    "How would you prioritize multiple urgent tasks when you can't complete them all?",
    "If you disagreed with your manager's decision, how would you approach the situation?",
    "What would you do if you noticed a colleague was struggling with their work?",
    "How would you handle a situation where you made a mistake that affected the team?",
  ],
};

const isTechProfile = (roles: string[], skills: string[], currentRole?: string | null) => {
  const haystack = [...roles, ...(skills || []), currentRole || ''].join(' ').toLowerCase();
  return /(engineer|developer|software|devops|backend|frontend|full stack|data engineer|security|sre|cloud|qa|automation|mobile|ios|android)/i.test(haystack);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { action, ...params } = await req.json();

    if (action === 'get_questions') {
      const { data: profile } = await supabase
        .from('job_seeker_profiles')
        .select('skills, actively_looking_roles, current_role')
        .eq('user_id', userId)
        .maybeSingle();

      const roles = profile?.actively_looking_roles || [];
      const skills = profile?.skills || [];
      const currentRole = profile?.current_role || '';
      const isTech = isTechProfile(roles, skills, currentRole);

      const domainPool = isTech ? INTERVIEW_QUESTIONS.technical : INTERVIEW_QUESTIONS.non_tech;

      const questions = [
        { type: 'behavioral', question: INTERVIEW_QUESTIONS.behavioral[Math.floor(Math.random() * 5)] },
        { type: 'behavioral', question: INTERVIEW_QUESTIONS.behavioral[Math.floor(Math.random() * 5)] },
        { type: 'domain', question: domainPool[Math.floor(Math.random() * 5)] },
        { type: 'domain', question: domainPool[Math.floor(Math.random() * 5)] },
        { type: 'situational', question: INTERVIEW_QUESTIONS.situational[Math.floor(Math.random() * 5)] },
      ];

      return new Response(
        JSON.stringify({ questions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'analyze_response') {
      const { transcript, questionType, questionText } = params;

      if (!transcript || !questionType || !questionText) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
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

      console.log('Analyzing interview response for user:', userId);
      console.log('Question type:', questionType);
      console.log('Transcript length:', transcript.length);

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
              content: `You are an expert interview evaluator for a hiring platform. Your job is to analyze candidate interview responses and provide objective scoring and feedback.

EVALUATION CRITERIA:
1. Relevance (0-25): How well the answer addresses the question
2. Clarity (0-25): How clearly the candidate communicates
3. Depth (0-25): Level of detail and thoughtfulness
4. Professionalism (0-25): Professional language and demeanor

SCORING GUIDELINES:
- 0-40: Poor - Response is off-topic, unclear, or shows red flags
- 41-60: Below Average - Partially addresses question but lacks depth
- 61-75: Average - Adequate response with room for improvement
- 76-85: Good - Strong response with good examples
- 86-100: Excellent - Outstanding response with specific examples and insights

FLAG RESPONSE IF:
- Contains inappropriate language or content
- Shows signs of reading from a script
- Mentions illegal activities
- Contains discriminatory statements
- Response is too short or generic (less than 30 words)
- Completely off-topic`
            },
            {
              role: 'user',
              content: `Evaluate this ${questionType} interview response:

QUESTION: ${questionText}

CANDIDATE'S RESPONSE: ${transcript}

Analyze and score the response.`
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "evaluate_interview_response",
                description: "Evaluate an interview response with scoring and feedback",
                parameters: {
                  type: "object",
                  properties: {
                    score: {
                      type: "number",
                      description: "Overall score from 0-100"
                    },
                    confidence_score: {
                      type: "number",
                      description: "Confidence in the evaluation from 0-100"
                    },
                    feedback: {
                      type: "string",
                      description: "Constructive feedback for the candidate (2-3 sentences)"
                    },
                    strengths: {
                      type: "array",
                      items: { type: "string" },
                      description: "Key strengths demonstrated in the response"
                    },
                    improvements: {
                      type: "array",
                      items: { type: "string" },
                      description: "Areas for improvement"
                    },
                    keywords_detected: {
                      type: "array",
                      items: { type: "string" },
                      description: "Relevant keywords and skills mentioned"
                    },
                    is_flagged: {
                      type: "boolean",
                      description: "Whether the response should be flagged for admin review"
                    },
                    flag_reason: {
                      type: "string",
                      description: "Reason for flagging (if applicable)"
                    }
                  },
                  required: ["score", "confidence_score", "feedback", "strengths", "improvements", "keywords_detected", "is_flagged"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "evaluate_interview_response" } }
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
          JSON.stringify({ error: 'Failed to analyze response' }),
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

      const evaluation = JSON.parse(toolCall.function.arguments);
      console.log('Interview analysis complete for user:', userId);

      return new Response(
        JSON.stringify({ evaluation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-interview-response function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
