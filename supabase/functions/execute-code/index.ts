import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Judge0 language IDs
const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63, // Node.js
  python: 71,     // Python 3
  java: 62,       // Java
  cpp: 54,        // C++ (GCC 9.2.0)
  c: 50,          // C (GCC 9.2.0)
};

interface ExecuteRequest {
  code: string;
  language: string;
  testCases: Array<{
    input: string;
    expectedOutput: string;
  }>;
  functionName?: string;
}

interface TestResult {
  testIndex: number;
  passed: boolean;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  error?: string;
  executionTime?: number;
  memoryUsed?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require valid JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    // Verify JWT and get user claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("JWT verification failed:", claimsError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user for code execution: ${userId}`);

    const JUDGE0_API_KEY = Deno.env.get("JUDGE0_API_KEY");
    
    if (!JUDGE0_API_KEY) {
      console.error("JUDGE0_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Code execution service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { code, language, testCases, functionName }: ExecuteRequest = await req.json();

    console.log(`User ${userId} executing ${language} code for ${testCases.length} test cases`);

    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return new Response(
        JSON.stringify({ error: `Unsupported language: ${language}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: TestResult[] = [];

    // Execute code for each test case
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      
      // Prepare the code with test input
      let executableCode = code;
      
      // For Python, add test execution at the end if it's a class-based solution
      if (language === "python") {
        if (code.includes("class Solution:") && functionName) {
          executableCode = `${code}

# Test execution
import sys
input_data = """${testCase.input}"""
lines = input_data.strip().split("\\n")

# Parse input based on the function
solution = Solution()
try:
    result = solution.${functionName}(*eval_input(lines))
    print(result)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)

def eval_input(lines):
    parsed = []
    for line in lines:
        try:
            parsed.append(eval(line))
        except:
            parsed.append(line)
    return parsed
`;
        }
      } else if (language === "javascript") {
        // For JavaScript, ensure the function is called with test input
        if (functionName && !code.includes("console.log")) {
          executableCode = `${code}

// Test execution
const inputData = \`${testCase.input}\`;
const lines = inputData.trim().split("\\n");
const parsedInput = lines.map(line => {
  try {
    return JSON.parse(line);
  } catch {
    return line;
  }
});

try {
  const result = ${functionName}(...parsedInput);
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e.message);
}
`;
        }
      }

      // Create submission
      const createResponse = await fetch(
        "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RapidAPI-Key": JUDGE0_API_KEY,
            "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
          },
          body: JSON.stringify({
            language_id: languageId,
            source_code: btoa(executableCode),
            stdin: btoa(testCase.input),
            expected_output: btoa(testCase.expectedOutput),
            cpu_time_limit: 5,
            memory_limit: 128000,
          }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`Judge0 API error: ${errorText}`);
        results.push({
          testIndex: i + 1,
          passed: false,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: "",
          error: "Code execution service error",
        });
        continue;
      }

      const result = await createResponse.json();
      
      // Decode outputs
      const stdout = result.stdout ? atob(result.stdout).trim() : "";
      const stderr = result.stderr ? atob(result.stderr).trim() : "";
      const compileOutput = result.compile_output ? atob(result.compile_output).trim() : "";
      
      // Determine if passed (normalize outputs for comparison)
      const normalizeOutput = (str: string) => {
        return str
          .trim()
          .replace(/\s+/g, " ")
          .replace(/'/g, '"')
          .toLowerCase();
      };
      
      const passed = 
        result.status?.id === 3 && // Accepted
        normalizeOutput(stdout) === normalizeOutput(testCase.expectedOutput);

      results.push({
        testIndex: i + 1,
        passed,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: stdout || compileOutput || stderr,
        error: result.status?.id === 6 ? "Compilation Error" :
               result.status?.id === 5 ? "Time Limit Exceeded" :
               result.status?.id === 11 ? "Runtime Error" :
               stderr || undefined,
        executionTime: result.time ? parseFloat(result.time) * 1000 : undefined,
        memoryUsed: result.memory,
      });
    }

    const passedCount = results.filter(r => r.passed).length;
    
    console.log(`User ${userId} execution complete: ${passedCount}/${testCases.length} tests passed`);

    return new Response(
      JSON.stringify({
        results,
        summary: {
          totalTests: testCases.length,
          passed: passedCount,
          failed: testCases.length - passedCount,
          allPassed: passedCount === testCases.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Execute code error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to execute code";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
