/**
 * Full Judge0-oriented starter code for each DSA bank question (stdin → stdout).
 * Keys must match ProgrammingLanguage in dsaRoundConfig.
 */
import type { ProgrammingLanguage } from "./dsaRoundConfig";

export type LangStarters = Record<ProgrammingLanguage, string>;

/** questionNumber in rawDSAQuestions (1-based). */
export function startersForQuestionNumber(qn: number): LangStarters {
  const b = BUILDERS[qn];
  if (!b) {
    return emptyFallback(qn);
  }
  return {
    javascript: b.js(),
    python: b.py(),
    java: b.java(),
    cpp: b.cpp(),
    c: b.c(),
  };
}

function emptyFallback(qn: number): LangStarters {
  const c = `# Question ${qn}: implement stdin/stdout solution.`;
  return {
    javascript: `// Question ${qn}\nconst fs = require("fs");\nconst input = fs.readFileSync(0, "utf8");\n// Write your solution here\n`,
    python: `# Question ${qn}\nfrom __future__ import annotations\n\nimport sys\n\ndef main():\n    # Write your solution here\n    pass\n\nif __name__ == "__main__":\n    main()\n`,
    java: `// Question ${qn}\nimport java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        // Write your solution here\n    }\n}\n`,
    cpp: `// Question ${qn}\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}\n`,
    c: `/* Question ${qn} */\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main(void) {\n    /* Write your solution here */\n    return 0;\n}\n`,
  };
}

type Builder = { js: () => string; py: () => string; java: () => string; cpp: () => string; c: () => string };

const BUILDERS: Record<number, Builder> = {
  1: {
    py: () => `from __future__ import annotations

def findWordsInMatrix(s: str, searchWords: list[str], R: int, C: int) -> str:
    # Write your solution here
    return ""

if __name__ == "__main__":
    s = input().strip()
    searchWords = input().split()
    R = int(input())
    C = int(input())
    print(findWordsInMatrix(s, searchWords, R, C))
`,
    js: () => `function findWordsInMatrix(s, searchWords, R, C) {
  // Write your solution here
  return "";
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const s = lines[0].trim();
const searchWords = lines[1].trim().split(/\\s+/);
const R = parseInt(lines[2], 10);
const C = parseInt(lines[3], 10);
console.log(findWordsInMatrix(s, searchWords, R, C));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static String findWordsInMatrix(String s, String[] searchWords, int R, int C) {
        // Write your solution here
        return "";
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String s = br.readLine().trim();
        String[] searchWords = br.readLine().trim().split("\\\\s+");
        int R = Integer.parseInt(br.readLine().trim());
        int C = Integer.parseInt(br.readLine().trim());
        System.out.println(findWordsInMatrix(s, searchWords, R, C));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

string findWordsInMatrix(const string& s, const vector<string>& searchWords, int R, int C) {
    // Write your solution here
    return "";
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s;
    getline(cin, s);
    string line;
    getline(cin, line);
    vector<string> sw;
    stringstream ss(line);
    string w;
    while (ss >> w) sw.push_back(w);
    int R, C;
    cin >> R >> C;
    cout << findWordsInMatrix(s, sw, R, C) << "\\n";
    return 0;
}
`,
    c: () => `/* Custom Vertical Fill Matrix — stdin matches Python/JS */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Implement: build matrix, find words; return answer string in buf (space-separated hits) */
void find_words_in_matrix(const char *s, char **search_words, int word_count, int R, int C, char *out, size_t out_sz) {
    (void)s;
    (void)search_words;
    (void)word_count;
    (void)R;
    (void)C;
    (void)out_sz;
    out[0] = '\\0';
}

int main(void) {
    char s[4096], line[8192];
    if (!fgets(s, sizeof s, stdin)) return 0;
    s[strcspn(s, "\\n")] = 0;
    if (!fgets(line, sizeof line, stdin)) return 0;
    line[strcspn(line, "\\n")] = 0;
    int R, C;
    if (scanf("%d %d", &R, &C) != 2) return 0;

    char *words[256];
    int wc = 0;
    char *tok = strtok(line, " \\t");
    while (tok && wc < 256) {
        words[wc++] = tok;
        tok = strtok(NULL, " \\t");
    }

    char out[8192];
    find_words_in_matrix(s, words, wc, R, C, out, sizeof out);
    printf("%s\\n", out);
    return 0;
}
`,
  },

  2: {
    py: () => `from __future__ import annotations

def solve_tree(n: int, vals: list[int], edges: list[tuple[int, int]]) -> list[int]:
    # Write your solution here — return counts for nodes 1..n
    return [0] * n

if __name__ == "__main__":
    n = int(input())
    vals = list(map(int, input().split()))
    edges = []
    for _ in range(max(0, n - 1)):
        edges.append(tuple(map(int, input().split())))
    out = solve_tree(n, vals, edges)
    print(" ".join(map(str, out)))
`,
    js: () => `function solveTree(n, vals, edges) {
  // Write your solution here — return array length n
  return Array(n).fill(0);
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
let i = 0;
const n = parseInt(lines[i++], 10);
const vals = lines[i++].trim().split(/\\s+/).map(Number);
const edges = [];
for (let e = 0; e < Math.max(0, n - 1); e++) {
  const p = lines[i++].trim().split(/\\s+/).map(Number);
  edges.push([p[0], p[1]]);
}
const out = solveTree(n, vals, edges);
console.log(out.join(" "));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int[] solveTree(int n, int[] vals, int[][] edges) {
        // Write your solution here
        return new int[n];
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] vs = br.readLine().trim().split("\\\\s+");
        int[] vals = new int[n];
        for (int i = 0; i < n; i++) vals[i] = Integer.parseInt(vs[i]);
        int[][] edges = new int[Math.max(0, n - 1)][2];
        for (int e = 0; e < Math.max(0, n - 1); e++) {
            String[] p = br.readLine().trim().split("\\\\s+");
            edges[e][0] = Integer.parseInt(p[0]);
            edges[e][1] = Integer.parseInt(p[1]);
        }
        int[] out = solveTree(n, vals, edges);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < out.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(out[i]);
        }
        System.out.println(sb.toString());
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

vector<int> solveTree(int n, const vector<int>& vals, const vector<pair<int,int>>& edges) {
    // Write your solution here
    return vector<int>(n, 0);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> vals(n);
    for (int i = 0; i < n; i++) cin >> vals[i];
    vector<pair<int,int>> edges;
    for (int e = 0; e < max(0, n - 1); e++) {
        int u, v;
        cin >> u >> v;
        edges.push_back({u, v});
    }
    vector<int> out = solveTree(n, vals, edges);
    for (int i = 0; i < (int)out.size(); i++) {
        if (i) cout << ' ';
        cout << out[i];
    }
    cout << "\\n";
    return 0;
}
`,
    c: () => `/* GCD Territories — stdin: n, n values, n-1 edges u v */
#include <stdio.h>
#include <stdlib.h>

static void solve_tree(int n, const int *vals, const int *u, const int *v, int *out) {
    (void)vals;
    (void)u;
    (void)v;
    for (int i = 0; i < n; i++) out[i] = 0;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1 || n < 1 || n > 2000) return 0;
    int *vals = (int *)calloc((size_t)n, sizeof(int));
    int *u = (int *)calloc((size_t)(n > 1 ? n - 1 : 1), sizeof(int));
    int *v = (int *)calloc((size_t)(n > 1 ? n - 1 : 1), sizeof(int));
    if (!vals || !u || !v) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &vals[i]);
    for (int e = 0; e < n - 1; e++) scanf("%d %d", &u[e], &v[e]);
    int *out = (int *)calloc((size_t)n, sizeof(int));
    if (!out) return 0;
    solve_tree(n, vals, u, v, out);
    for (int i = 0; i < n; i++) {
        if (i) printf(" ");
        printf("%d", out[i]);
    }
    printf("\\n");
    free(vals);
    free(u);
    free(v);
    free(out);
    return 0;
}
`,
  },

  3: {
    py: () => `from __future__ import annotations

MOD = 10**9 + 7

def peacock_ways(n: int) -> int:
    # Write your solution here
    return 0

if __name__ == "__main__":
    n = int(input())
    print(peacock_ways(n) % (10**9 + 7))
`,
    js: () => `const MOD = 1e9 + 7;

function peacockWays(n) {
  // Write your solution here
  return 0;
}

const fs = require("fs");
const n = parseInt(fs.readFileSync(0, "utf8").trim(), 10);
console.log(peacockWays(n) % MOD);
`,
    java: () => `import java.io.*;

public class Main {
    static final long MOD = 1_000_000_007L;

    static long peacockWays(int n) {
        // Write your solution here
        return 0;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        System.out.println(peacockWays(n) % MOD);
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;
static const long long MOD = 1000000007LL;

long long peacockWays(int n) {
    // Write your solution here
    return 0;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    cout << peacockWays(n) % MOD << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#define MOD 1000000007LL

long long peacock_ways(int n) {
    /* Write your solution here */
    return 0;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    printf("%lld\\n", peacock_ways(n) % MOD);
    return 0;
}
`,
  },

  4: {
    py: () => `from __future__ import annotations

def can_reach_target(n: int, arr: list[int], target: int) -> bool:
    # Write your solution here
    return False

if __name__ == "__main__":
    n = int(input())
    arr = list(map(int, input().split()))
    target = int(input())
    print(str(can_reach_target(n, arr, target)).lower())
`,
    js: () => `function canReachTarget(n, arr, target) {
  // Write your solution here
  return false;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const arr = lines[1].trim().split(/\\s+/).map(Number);
const target = parseInt(lines[2], 10);
console.log(String(canReachTarget(n, arr, target)).toLowerCase());
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static boolean canReachTarget(int n, int[] arr, int target) {
        // Write your solution here
        return false;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = Integer.parseInt(as[i]);
        int target = Integer.parseInt(br.readLine().trim());
        System.out.println(canReachTarget(n, arr, target) ? "true" : "false");
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

bool canReachTarget(int n, const vector<int>& arr, int target) {
    // Write your solution here
    return false;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    int target;
    cin >> target;
    cout << (canReachTarget(n, arr, target) ? "true" : "false") << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdbool.h>

bool can_reach_target(int n, int *arr, int target) {
    /* Write your solution here */
    return false;
}

int main(void) {
    int n;
    scanf("%d", &n);
    int arr[64];
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);
    int target;
    scanf("%d", &target);
    printf("%s\\n", can_reach_target(n, arr, target) ? "true" : "false");
    return 0;
}
`,
  },

  5: {
    py: () => `from __future__ import annotations

def nearest_larger_neg(N: int, A: list[int], x: int) -> int:
    # Write your solution here
    return -1

if __name__ == "__main__":
    N = int(input())
    A = list(map(int, input().split()))
    x = int(input())
    print(nearest_larger_neg(N, A, x))
`,
    js: () => `function nearestLargerNeg(N, A, x) {
  // Write your solution here
  return -1;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const N = parseInt(lines[0], 10);
const A = lines[1].trim().split(/\\s+/).map(Number);
const x = parseInt(lines[2], 10);
console.log(nearestLargerNeg(N, A, x));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int nearestLargerNeg(int N, int[] A, int x) {
        // Write your solution here
        return -1;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int N = Integer.parseInt(br.readLine().trim());
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] A = new int[N];
        for (int i = 0; i < N; i++) A[i] = Integer.parseInt(as[i]);
        int x = Integer.parseInt(br.readLine().trim());
        System.out.println(nearestLargerNeg(N, A, x));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int nearestLargerNeg(int N, const vector<int>& A, int x) {
    // Write your solution here
    return -1;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int N;
    cin >> N;
    vector<int> A(N);
    for (int i = 0; i < N; i++) cin >> A[i];
    int x;
    cin >> x;
    cout << nearestLargerNeg(N, A, x) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>

int nearest_larger_neg(int N, int *A, int x) {
    /* Write your solution here */
    return -1;
}

int main(void) {
    int N;
    scanf("%d", &N);
    int A[128];
    for (int i = 0; i < N; i++) scanf("%d", &A[i]);
    int x;
    scanf("%d", &x);
    printf("%d\\n", nearest_larger_neg(N, A, x));
    return 0;
}
`,
  },

  6: {
    py: () => `from __future__ import annotations

def roman_bst_search(n: int, level: list[str], target: str) -> str:
    # Write your solution here — return "Found" or "Not Found"
    return "Not Found"

if __name__ == "__main__":
    n = int(input())
    level = input().split()
    target = input().strip()
    print(roman_bst_search(n, level, target))
`,
    js: () => `function romanBstSearch(n, level, target) {
  // Write your solution here
  return "Not Found";
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const level = lines[1].trim().split(/\\s+/);
const target = lines[2].trim();
console.log(romanBstSearch(n, level, target));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static String romanBstSearch(int n, String[] level, String target) {
        // Write your solution here
        return "Not Found";
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] level = br.readLine().trim().split("\\\\s+");
        String target = br.readLine().trim();
        System.out.println(romanBstSearch(n, level, target));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

string romanBstSearch(int n, const vector<string>& level, const string& target) {
    // Write your solution here
    return "Not Found";
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<string> level(n);
    for (int i = 0; i < n; i++) cin >> level[i];
    string target;
    cin >> target;
    cout << romanBstSearch(n, level, target) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <string.h>

static void roman_bst_search(int n, char level[][32], const char *target, char *result, size_t rsz) {
    (void)n;
    (void)level;
    (void)target;
    (void)rsz;
    strncpy(result, "Not Found", rsz - 1);
    result[rsz - 1] = '\\0';
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1 || n < 1 || n > 64) return 0;
    static char level[64][32];
    for (int i = 0; i < n; i++) {
        if (scanf("%31s", level[i]) != 1) return 0;
    }
    char target[32];
    if (scanf("%31s", target) != 1) return 0;
    char out[64];
    roman_bst_search(n, level, target, out, sizeof out);
    printf("%s\\n", out);
    return 0;
}
`,
  },

  7: {
    py: () => `from __future__ import annotations

def solve_queries(n: int, arr: list[int], queries: list[tuple[int, int]]) -> list[str]:
    # Write your solution here — "YES" / "NO" per query
    return ["NO"] * len(queries)

if __name__ == "__main__":
    import sys
    data = sys.stdin.read().strip().split("\\n")
    nq = list(map(int, data[0].split()))
    n, q = nq[0], nq[1]
    arr = list(map(int, data[1].split()))
    queries = []
    for i in range(q):
        queries.append(tuple(map(int, data[2 + i].split())))
    for line in solve_queries(n, arr, queries):
        print(line)
`,
    js: () => `function solveQueries(n, arr, queries) {
  // Write your solution here
  return queries.map(() => "NO");
}

const fs = require("fs");
const data = fs.readFileSync(0, "utf8").trim().split("\\n");
const nq = data[0].trim().split(/\\s+/).map(Number);
const n = nq[0], q = nq[1];
const arr = data[1].trim().split(/\\s+/).map(Number);
const queries = [];
for (let i = 0; i < q; i++) {
  const p = data[2 + i].trim().split(/\\s+/).map(Number);
  queries.push([p[0], p[1]]);
}
console.log(solveQueries(n, arr, queries).join("\\n"));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static String[] solveQueries(int n, int[] arr, int[][] queries) {
        // Write your solution here
        String[] out = new String[queries.length];
        Arrays.fill(out, "NO");
        return out;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] l0 = br.readLine().trim().split("\\\\s+");
        int n = Integer.parseInt(l0[0]);
        int q = Integer.parseInt(l0[1]);
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = Integer.parseInt(as[i]);
        int[][] queries = new int[q][2];
        for (int i = 0; i < q; i++) {
            String[] p = br.readLine().trim().split("\\\\s+");
            queries[i][0] = Integer.parseInt(p[0]);
            queries[i][1] = Integer.parseInt(p[1]);
        }
        for (String s : solveQueries(n, arr, queries)) System.out.println(s);
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

vector<string> solveQueries(int n, const vector<int>& arr, const vector<pair<int,int>>& queries) {
    // Write your solution here
    return vector<string>(queries.size(), "NO");
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, q;
    cin >> n >> q;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    vector<pair<int,int>> queries(q);
    for (int i = 0; i < q; i++) cin >> queries[i].first >> queries[i].second;
    for (const string& s : solveQueries(n, arr, queries)) cout << s << "\\n";
    return 0;
}
`,
    c: () => `#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void solve_queries(int n, const int *arr, int q, int *qi, int *qj, char **out_lines) {
    (void)arr;
    for (int i = 0; i < q; i++) {
        (void)qi[i];
        (void)qj[i];
        out_lines[i] = strdup("NO");
    }
}

int main(void) {
    int n, q;
    if (scanf("%d %d", &n, &q) != 2) return 0;
    int *arr = (int *)malloc((size_t)n * sizeof(int));
    if (!arr) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);
    int *qi = (int *)malloc((size_t)q * sizeof(int));
    int *qj = (int *)malloc((size_t)q * sizeof(int));
    char **out = (char **)malloc((size_t)q * sizeof(char *));
    if (!qi || !qj || !out) return 0;
    for (int i = 0; i < q; i++) scanf("%d %d", &qi[i], &qj[i]);
    solve_queries(n, arr, q, qi, qj, out);
    for (int i = 0; i < q; i++) {
        printf("%s\\n", out[i]);
        free(out[i]);
    }
    free(arr);
    free(qi);
    free(qj);
    free(out);
    return 0;
}
`,
  },

  8: {
    py: () => `from __future__ import annotations

def find_divisors(a: int, b: int) -> tuple[int, int] | None:
    # Write your solution here — return (x,y) or None
    return None

if __name__ == "__main__":
    a, b = map(int, input().split())
    r = find_divisors(a, b)
    print("-1" if r is None else f"{r[0]} {r[1]}")
`,
    js: () => `function findDivisors(a, b) {
  // Write your solution here — return [x,y] or null
  return null;
}

const fs = require("fs");
const [a, b] = fs.readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);
const r = findDivisors(a, b);
console.log(r ? r[0] + " " + r[1] : "-1");
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int[] findDivisors(int a, int b) {
        // Write your solution here — return {x,y} or null
        return null;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] p = br.readLine().trim().split("\\\\s+");
        int a = Integer.parseInt(p[0]);
        int b = Integer.parseInt(p[1]);
        int[] r = findDivisors(a, b);
        if (r == null) System.out.println("-1");
        else System.out.println(r[0] + " " + r[1]);
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

// Return true and set x,y if found; else false
bool findDivisors(int a, int b, int& x, int& y) {
    // Write your solution here
    return false;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int a, b;
    cin >> a >> b;
    int x = 0, y = 0;
    if (!findDivisors(a, b, x, y)) cout << "-1\\n";
    else cout << x << " " << y << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdbool.h>

static bool find_divisors(int a, int b, int *x, int *y) {
    (void)a;
    (void)b;
    *x = *y = 0;
    return false;
}

int main(void) {
    int a, b;
    if (scanf("%d %d", &a, &b) != 2) return 0;
    int x = 0, y = 0;
    if (!find_divisors(a, b, &x, &y)) printf("-1\\n");
    else printf("%d %d\\n", x, y);
    return 0;
}
`,
  },

  9: {
    py: () => `from __future__ import annotations

def max_gcd_after_two_removal(n: int, arr: list[int]) -> int:
    # Write your solution here
    return 0

if __name__ == "__main__":
    n = int(input())
    arr = list(map(int, input().split()))
    print(max_gcd_after_two_removal(n, arr))
`,
    js: () => `function maxGcdAfterTwoRemoval(n, arr) {
  // Write your solution here
  return 0;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const arr = lines[1].trim().split(/\\s+/).map(Number);
console.log(maxGcdAfterTwoRemoval(n, arr));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int maxGcdAfterTwoRemoval(int n, int[] arr) {
        // Write your solution here
        return 0;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = Integer.parseInt(as[i]);
        System.out.println(maxGcdAfterTwoRemoval(n, arr));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int maxGcdAfterTwoRemoval(int n, const vector<int>& arr) {
    // Write your solution here
    return 0;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    cout << maxGcdAfterTwoRemoval(n, arr) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static int max_gcd_after_two_removal(int n, const int *arr) {
    (void)n;
    (void)arr;
    return 0;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1 || n < 1) return 0;
    int *p = (int *)calloc((size_t)n, sizeof(int));
    if (!p) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &p[i]);
    printf("%d\\n", max_gcd_after_two_removal(n, p));
    free(p);
    return 0;
}
`,
  },

  10: {
    py: () => `from __future__ import annotations

def bottom_up_remove(n: int, level: list[int]) -> list[int]:
    # Write your solution here
    return level[:]

if __name__ == "__main__":
    n = int(input())
    level = list(map(int, input().split()))
    print(" ".join(map(str, bottom_up_remove(n, level))))
`,
    js: () => `function bottomUpRemove(n, level) {
  // Write your solution here
  return [...level];
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const level = lines[1].trim().split(/\\s+/).map(Number);
console.log(bottomUpRemove(n, level).join(" "));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int[] bottomUpRemove(int n, int[] level) {
        // Write your solution here
        return level.clone();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] level = new int[n];
        for (int i = 0; i < n; i++) level[i] = Integer.parseInt(as[i]);
        int[] out = bottomUpRemove(n, level);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < out.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(out[i]);
        }
        System.out.println(sb.toString());
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

vector<int> bottomUpRemove(int n, const vector<int>& level) {
    // Write your solution here
    return level;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> level(n);
    for (int i = 0; i < n; i++) cin >> level[i];
    vector<int> out = bottomUpRemove(n, level);
    for (int i = 0; i < (int)out.size(); i++) {
        if (i) cout << ' ';
        cout << out[i];
    }
    cout << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static void bottom_up_remove(int n, const int *level, int *out, int *out_len) {
    for (int i = 0; i < n; i++) out[i] = level[i];
    *out_len = n;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1 || n < 1) return 0;
    int *level = (int *)calloc((size_t)n, sizeof(int));
    int *out = (int *)calloc((size_t)n, sizeof(int));
    if (!level || !out) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &level[i]);
    int out_len = 0;
    bottom_up_remove(n, level, out, &out_len);
    for (int i = 0; i < out_len; i++) {
        if (i) printf(" ");
        printf("%d", out[i]);
    }
    printf("\\n");
    free(level);
    free(out);
    return 0;
}
`,
  },

  11: {
    py: () => `from __future__ import annotations

MOD = 10**9 + 7

def count_partitions(n: int, k: int, arr: list[int]) -> int:
    # Write your solution here
    return 0

if __name__ == "__main__":
    n, k = map(int, input().split())
    arr = list(map(int, input().split()))
    print(count_partitions(n, k, arr) % MOD)
`,
    js: () => `const MOD = 1e9 + 7;

function countPartitions(n, k, arr) {
  // Write your solution here
  return 0;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const nk = lines[0].trim().split(/\\s+/).map(Number);
const n = nk[0], k = nk[1];
const arr = lines[1].trim().split(/\\s+/).map(Number);
console.log(countPartitions(n, k, arr) % MOD);
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static final int MOD = 1_000_000_007;

    static int countPartitions(int n, int k, int[] arr) {
        // Write your solution here
        return 0;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] nk = br.readLine().trim().split("\\\\s+");
        int n = Integer.parseInt(nk[0]);
        int k = Integer.parseInt(nk[1]);
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = Integer.parseInt(as[i]);
        System.out.println(countPartitions(n, k, arr) % MOD);
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;
const int MOD = 1000000007;

int countPartitions(int n, int k, const vector<int>& arr) {
    // Write your solution here
    return 0;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, k;
    cin >> n >> k;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    cout << countPartitions(n, k, arr) % MOD << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>
#define MOD 1000000007

static int count_partitions(int n, int k, const int *arr) {
    (void)n;
    (void)k;
    (void)arr;
    return 0;
}

int main(void) {
    int n, k;
    if (scanf("%d %d", &n, &k) != 2) return 0;
    int *arr = (int *)calloc((size_t)n, sizeof(int));
    if (!arr) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);
    printf("%d\\n", count_partitions(n, k, arr) % MOD);
    free(arr);
    return 0;
}
`,
  },

  12: {
    py: () => `from __future__ import annotations

def forward_backward(len_nodes: int, start: int, values: list[int]) -> list[int]:
    # Write your solution here
    return []

if __name__ == "__main__":
    len_nodes = int(input())
    start = int(input())
    values = list(map(int, input().split()))
    print(" ".join(map(str, forward_backward(len_nodes, start, values))))
`,
    js: () => `function forwardBackward(lenNodes, start, values) {
  // Write your solution here
  return [];
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const lenNodes = parseInt(lines[0], 10);
const start = parseInt(lines[1], 10);
const values = lines[2].trim().split(/\\s+/).map(Number);
console.log(forwardBackward(lenNodes, start, values).join(" "));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int[] forwardBackward(int lenNodes, int start, int[] values) {
        // Write your solution here
        return new int[0];
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int lenNodes = Integer.parseInt(br.readLine().trim());
        int start = Integer.parseInt(br.readLine().trim());
        String[] vs = br.readLine().trim().split("\\\\s+");
        int[] values = new int[lenNodes];
        for (int i = 0; i < lenNodes; i++) values[i] = Integer.parseInt(vs[i]);
        int[] out = forwardBackward(lenNodes, start, values);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < out.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(out[i]);
        }
        System.out.println(sb.toString());
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

vector<int> forwardBackward(int lenNodes, int start, const vector<int>& values) {
    // Write your solution here
    return {};
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int lenNodes, start;
    cin >> lenNodes >> start;
    vector<int> values(lenNodes);
    for (int i = 0; i < lenNodes; i++) cin >> values[i];
    vector<int> out = forwardBackward(lenNodes, start, values);
    for (int i = 0; i < (int)out.size(); i++) {
        if (i) cout << ' ';
        cout << out[i];
    }
    cout << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static void forward_backward(int len_nodes, int start, const int *values, int *out, int *out_len) {
    (void)start;
    *out_len = len_nodes;
    for (int i = 0; i < len_nodes; i++) out[i] = values[i];
}

int main(void) {
    int len_nodes, start;
    if (scanf("%d", &len_nodes) != 1) return 0;
    if (scanf("%d", &start) != 1) return 0;
    int *values = (int *)calloc((size_t)len_nodes, sizeof(int));
    int *out = (int *)calloc((size_t)len_nodes, sizeof(int));
    if (!values || !out) return 0;
    for (int i = 0; i < len_nodes; i++) scanf("%d", &values[i]);
    int out_len = 0;
    forward_backward(len_nodes, start, values, out, &out_len);
    for (int i = 0; i < out_len; i++) {
        if (i) printf(" ");
        printf("%d", out[i]);
    }
    printf("\\n");
    free(values);
    free(out);
    return 0;
}
`,
  },

  13: {
    py: () => `from __future__ import annotations

def chocolate_time(N: int, C: int, eat: int) -> int:
    # Write your solution here
    return 0

if __name__ == "__main__":
    N, C, eat = map(int, input().split())
    print(chocolate_time(N, C, eat))
`,
    js: () => `function chocolateTime(N, C, eat) {
  // Write your solution here
  return 0;
}

const fs = require("fs");
const [N, C, eat] = fs.readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);
console.log(chocolateTime(N, C, eat));
`,
    java: () => `import java.io.*;

public class Main {
    static int chocolateTime(int N, int C, int eat) {
        // Write your solution here
        return 0;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] p = br.readLine().trim().split("\\\\s+");
        int N = Integer.parseInt(p[0]);
        int C = Integer.parseInt(p[1]);
        int eat = Integer.parseInt(p[2]);
        System.out.println(chocolateTime(N, C, eat));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int chocolateTime(int N, int C, int eat) {
    // Write your solution here
    return 0;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int N, C, eat;
    cin >> N >> C >> eat;
    cout << chocolateTime(N, C, eat) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>

static int chocolate_time(int N, int C, int eat) {
    (void)N;
    (void)C;
    (void)eat;
    return 0;
}

int main(void) {
    int N, C, eat;
    if (scanf("%d %d %d", &N, &C, &eat) != 3) return 0;
    printf("%d\\n", chocolate_time(N, C, eat));
    return 0;
}
`,
  },

  14: {
    py: () => `from __future__ import annotations

def dual_link_traversal(n: int, desc: str, m: int, ops: str) -> list[int]:
    # Write your solution here
    return []

if __name__ == "__main__":
    n = int(input())
    desc = input().strip()
    m = int(input())
    ops = input().strip()
    print(" ".join(map(str, dual_link_traversal(n, desc, m, ops))))
`,
    js: () => `function dualLinkTraversal(n, desc, m, ops) {
  // Write your solution here
  return [];
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const desc = lines[1];
const m = parseInt(lines[2], 10);
const ops = lines[3];
console.log(dualLinkTraversal(n, desc, m, ops).join(" "));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int[] dualLinkTraversal(int n, String desc, int m, String ops) {
        // Write your solution here
        return new int[0];
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String desc = br.readLine();
        int m = Integer.parseInt(br.readLine().trim());
        String ops = br.readLine().trim();
        int[] out = dualLinkTraversal(n, desc, m, ops);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < out.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(out[i]);
        }
        System.out.println(sb.toString());
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

vector<int> dualLinkTraversal(int n, const string& desc, int m, const string& ops) {
    // Write your solution here
    return {};
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    string desc;
    cin.ignore();
    getline(cin, desc);
    int m;
    cin >> m;
    string ops;
    cin.ignore();
    getline(cin, ops);
    vector<int> out = dualLinkTraversal(n, desc, m, ops);
    for (int i = 0; i < (int)out.size(); i++) {
        if (i) cout << ' ';
        cout << out[i];
    }
    cout << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void dual_link_traversal(int n, const char *desc, int m, const char *ops, int *out, int *out_len) {
    (void)desc;
    (void)ops;
    *out_len = 0;
    (void)n;
    (void)m;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int ch;
    do {
        ch = getchar();
    } while (ch == ' ' || ch == '\\t');
    if (ch != '\\n' && ch != EOF) ungetc(ch, stdin);
    char desc[4096];
    if (!fgets(desc, sizeof desc, stdin)) return 0;
    desc[strcspn(desc, "\\n")] = 0;
    int m;
    if (scanf("%d", &m) != 1) return 0;
    do {
        ch = getchar();
    } while (ch == ' ' || ch == '\\t');
    if (ch != '\\n' && ch != EOF) ungetc(ch, stdin);
    char ops[4096];
    if (!fgets(ops, sizeof ops, stdin)) return 0;
    ops[strcspn(ops, "\\n")] = 0;
    int out[1024];
    int out_len = 0;
    dual_link_traversal(n, desc, m, ops, out, &out_len);
    for (int i = 0; i < out_len; i++) {
        if (i) printf(" ");
        printf("%d", out[i]);
    }
    printf("\\n");
    return 0;
}
`,
  },

  15: {
    py: () => `from __future__ import annotations

def amusement_ride(n: int, k: int, names: list[str], t: int, confirm: list[int]) -> tuple[str, str]:
    # Write your solution here — ("seated line", "queue line")
    return "", ""

if __name__ == "__main__":
    n = int(input())
    k = int(input())
    names = input().split()
    t = int(input())
    confirm = list(map(int, input().split()))
    a, b = amusement_ride(n, k, names, t, confirm)
    print(a)
    print(b)
`,
    js: () => `function amusementRide(n, k, names, t, confirm) {
  // Write your solution here
  return ["", ""];
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const k = parseInt(lines[1], 10);
const names = lines[2].trim().split(/\\s+/);
const t = parseInt(lines[3], 10);
const confirm = lines[4].trim().split(/\\s+/).map(Number);
const [a, b] = amusementRide(n, k, names, t, confirm);
console.log(a + "\\n" + b);
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static String[] amusementRide(int n, int k, String[] names, int t, int[] confirm) {
        // Write your solution here
        return new String[] { "", "" };
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        int k = Integer.parseInt(br.readLine().trim());
        String[] names = br.readLine().trim().split("\\\\s+");
        int t = Integer.parseInt(br.readLine().trim());
        String[] cs = br.readLine().trim().split("\\\\s+");
        int[] confirm = new int[t];
        for (int i = 0; i < t; i++) confirm[i] = Integer.parseInt(cs[i]);
        String[] out = amusementRide(n, k, names, t, confirm);
        System.out.println(out[0]);
        System.out.println(out[1]);
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

pair<string,string> amusementRide(int n, int k, const vector<string>& names, int t, const vector<int>& confirm) {
    // Write your solution here
    return {"", ""};
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, k;
    cin >> n >> k;
    vector<string> names(n);
    for (int i = 0; i < n; i++) cin >> names[i];
    int t;
    cin >> t;
    vector<int> confirm(t);
    for (int i = 0; i < t; i++) cin >> confirm[i];
    auto p = amusementRide(n, k, names, t, confirm);
    cout << p.first << "\\n" << p.second << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void amusement_ride(
    int n, int k, char **names, int t, const int *confirm, char *line1, char *line2, size_t cap) {
    (void)n;
    (void)k;
    (void)names;
    (void)t;
    (void)confirm;
    line1[0] = line2[0] = '\\0';
    (void)cap;
}

int main(void) {
    int n, k;
    if (scanf("%d %d", &n, &k) != 2) return 0;
    char **names = (char **)calloc((size_t)n, sizeof(char *));
    if (!names) return 0;
    for (int i = 0; i < n; i++) {
        char buf[256];
        if (scanf("%255s", buf) != 1) return 0;
        names[i] = strdup(buf);
    }
    int t;
    if (scanf("%d", &t) != 1) return 0;
    int *confirm = (int *)calloc((size_t)t, sizeof(int));
    if (!confirm) return 0;
    for (int i = 0; i < t; i++) scanf("%d", &confirm[i]);
    char l1[8192], l2[8192];
    amusement_ride(n, k, names, t, confirm, l1, l2, sizeof l1);
    printf("%s\\n%s\\n", l1, l2);
    for (int i = 0; i < n; i++) free(names[i]);
    free(names);
    free(confirm);
    return 0;
}
`,
  },

  16: {
    py: () => `from __future__ import annotations

def department_report(lines: list[str]) -> None:
    # Write your solution here — print all lines to stdout
    pass

if __name__ == "__main__":
    t = int(input())
    lines = [input().strip() for _ in range(t)]
    department_report(lines)
`,
    js: () => `function departmentReport(lines) {
  // Write your solution here
}

const fs = require("fs");
const data = fs.readFileSync(0, "utf8").trim().split("\\n");
const t = parseInt(data[0], 10);
const lines = data.slice(1, 1 + t);
departmentReport(lines);
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static void departmentReport(String[] lines) {
        // Write your solution here
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int t = Integer.parseInt(br.readLine().trim());
        String[] lines = new String[t];
        for (int i = 0; i < t; i++) lines[i] = br.readLine();
        departmentReport(lines);
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

void departmentReport(const vector<string>& lines) {
    // Write your solution here
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int t;
    cin >> t;
    string dummy;
    getline(cin, dummy);
    vector<string> lines(t);
    for (int i = 0; i < t; i++) getline(cin, lines[i]);
    departmentReport(lines);
    return 0;
}
`,
    c: () => `#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void department_report(char **lines, int t) {
    (void)lines;
    (void)t;
}

int main(void) {
    int t;
    if (scanf("%d", &t) != 1 || t < 0) return 0;
    int ch = getchar();
    while (ch == ' ' || ch == '\\t') ch = getchar();
    if (ch != '\\n' && ch != EOF) ungetc(ch, stdin);
    char **lines = (char **)calloc((size_t)t, sizeof(char *));
    if (!lines) return 0;
    for (int i = 0; i < t; i++) {
        char buf[8192];
        if (!fgets(buf, sizeof buf, stdin)) {
            lines[i] = strdup("");
        } else {
            lines[i] = strdup(buf);
        }
    }
    department_report(lines, t);
    for (int i = 0; i < t; i++) free(lines[i]);
    free(lines);
    return 0;
}
`,
  },

  17: {
    py: () => `from __future__ import annotations

def mex_ops(n: int, k: int, a: list[int]) -> int:
    # Write your solution here
    return -1

if __name__ == "__main__":
    import sys
    data = sys.stdin.read().split()
    n = int(data[0])
    k = int(data[1])
    a = list(map(int, data[2 : 2 + n]))
    print(mex_ops(n, k, a))
`,
    js: () => `function mexOps(n, k, a) {
  // Write your solution here
  return -1;
}

const fs = require("fs");
const data = fs.readFileSync(0, "utf8").trim().split(/\\s+/);
const n = parseInt(data[0], 10);
const k = parseInt(data[1], 10);
const a = [];
for (let i = 0; i < n; i++) a.push(parseInt(data[2 + i], 10));
console.log(mexOps(n, k, a));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int mexOps(int n, int k, int[] a) {
        // Write your solution here
        return -1;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        int n = Integer.parseInt(st.nextToken());
        int k = Integer.parseInt(st.nextToken());
        int[] a = new int[n];
        int idx = 0;
        while (st.hasMoreTokens() && idx < n) {
            a[idx++] = Integer.parseInt(st.nextToken());
        }
        if (idx < n) {
            st = new StringTokenizer(br.readLine());
            while (idx < n) {
                a[idx++] = Integer.parseInt(st.nextToken());
            }
        }
        System.out.println(mexOps(n, k, a));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int mexOps(int n, int k, const vector<int>& a) {
    // Write your solution here
    return -1;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, k;
    cin >> n >> k;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    cout << mexOps(n, k, a) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static int mex_ops(int n, int k, const int *a) {
    (void)n;
    (void)k;
    (void)a;
    return -1;
}

int main(void) {
    int n, k;
    if (scanf("%d %d", &n, &k) != 2) return 0;
    int *a = (int *)calloc((size_t)n, sizeof(int));
    if (!a) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    printf("%d\\n", mex_ops(n, k, a));
    free(a);
    return 0;
}
`,
  },

  18: {
    py: () => `from __future__ import annotations

def rearrange_books(n: int, A: list[int]) -> int:
    # Write your solution here
    return -1

if __name__ == "__main__":
    n = int(input())
    A = list(map(int, input().split()))
    print(rearrange_books(n, A))
`,
    js: () => `function rearrangeBooks(n, A) {
  // Write your solution here
  return -1;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const A = lines[1].trim().split(/\\s+/).map(Number);
console.log(rearrangeBooks(n, A));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int rearrangeBooks(int n, int[] A) {
        // Write your solution here
        return -1;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] A = new int[n];
        for (int i = 0; i < n; i++) A[i] = Integer.parseInt(as[i]);
        System.out.println(rearrangeBooks(n, A));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int rearrangeBooks(int n, const vector<int>& A) {
    // Write your solution here
    return -1;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> A(n);
    for (int i = 0; i < n; i++) cin >> A[i];
    cout << rearrangeBooks(n, A) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static int rearrange_books(int n, const int *A) {
    (void)n;
    (void)A;
    return -1;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int *A = (int *)calloc((size_t)n, sizeof(int));
    if (!A) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &A[i]);
    printf("%d\\n", rearrange_books(n, A));
    free(A);
    return 0;
}
`,
  },

  19: {
    py: () => `from __future__ import annotations

def min_skip_effort(n: int, effort: list[int], k: int) -> int:
    # Write your solution here
    return 0

if __name__ == "__main__":
    n = int(input())
    effort = list(map(int, input().split()))
    k = int(input())
    print(min_skip_effort(n, effort, k))
`,
    js: () => `function minSkipEffort(n, effort, k) {
  // Write your solution here
  return 0;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const n = parseInt(lines[0], 10);
const effort = lines[1].trim().split(/\\s+/).map(Number);
const k = parseInt(lines[2], 10);
console.log(minSkipEffort(n, effort, k));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int minSkipEffort(int n, int[] effort, int k) {
        // Write your solution here
        return 0;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] es = br.readLine().trim().split("\\\\s+");
        int[] effort = new int[n];
        for (int i = 0; i < n; i++) effort[i] = Integer.parseInt(es[i]);
        int k = Integer.parseInt(br.readLine().trim());
        System.out.println(minSkipEffort(n, effort, k));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int minSkipEffort(int n, const vector<int>& effort, int k) {
    // Write your solution here
    return 0;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<int> effort(n);
    for (int i = 0; i < n; i++) cin >> effort[i];
    int k;
    cin >> k;
    cout << minSkipEffort(n, effort, k) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static int min_skip_effort(int n, const int *effort, int k) {
    (void)effort;
    (void)k;
    return 0;
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int *effort = (int *)calloc((size_t)n, sizeof(int));
    if (!effort) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &effort[i]);
    int k;
    if (scanf("%d", &k) != 1) return 0;
    printf("%d\\n", min_skip_effort(n, effort, k));
    free(effort);
    return 0;
}
`,
  },

  20: {
    py: () => `from __future__ import annotations

def last_box(s: str) -> str:
    # Write your solution here
    return ""

if __name__ == "__main__":
    s = input().strip()
    print(last_box(s), end="")
`,
    js: () => `function lastBox(s) {
  // Write your solution here
  return "";
}

const fs = require("fs");
const s = fs.readFileSync(0, "utf8").trim().split("\\n")[0];
process.stdout.write(lastBox(s));
`,
    java: () => `import java.io.*;

public class Main {
    static String lastBox(String s) {
        // Write your solution here
        return "";
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String s = br.readLine().trim();
        System.out.print(lastBox(s));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

string lastBox(const string& s) {
    // Write your solution here
    return "";
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s;
    cin >> s;
    cout << lastBox(s);
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <string.h>

static void last_box(const char *s, char *out, size_t out_sz) {
    (void)s;
    out[0] = '\\0';
    (void)out_sz;
}

int main(void) {
    char s[200005];
    if (scanf("%199999s", s) != 1) return 0;
    char out[200005];
    last_box(s, out, sizeof out);
    printf("%s", out);
    return 0;
}
`,
  },

  21: {
    py: () => `from __future__ import annotations

def min_buckets(n: int, c: int, arr: list[int]) -> int:
    # Write your solution here
    return -1

if __name__ == "__main__":
    n, c = map(int, input().split())
    arr = list(map(int, input().split()))
    print(min_buckets(n, c, arr))
`,
    js: () => `function minBuckets(n, c, arr) {
  // Write your solution here
  return -1;
}

const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split("\\n");
const nc = lines[0].trim().split(/\\s+/).map(Number);
const n = nc[0], c = nc[1];
const arr = lines[1].trim().split(/\\s+/).map(Number);
console.log(minBuckets(n, c, arr));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static int minBuckets(int n, int c, int[] arr) {
        // Write your solution here
        return -1;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] nc = br.readLine().trim().split("\\\\s+");
        int n = Integer.parseInt(nc[0]);
        int c = Integer.parseInt(nc[1]);
        String[] as = br.readLine().trim().split("\\\\s+");
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = Integer.parseInt(as[i]);
        System.out.println(minBuckets(n, c, arr));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

int minBuckets(int n, int c, const vector<int>& arr) {
    // Write your solution here
    return -1;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, c;
    cin >> n >> c;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    cout << minBuckets(n, c, arr) << "\\n";
    return 0;
}
`,
    c: () => `#include <stdio.h>
#include <stdlib.h>

static int min_buckets(int n, int c, const int *arr) {
    (void)c;
    (void)arr;
    return -1;
}

int main(void) {
    int n, c;
    if (scanf("%d %d", &n, &c) != 2) return 0;
    int *arr = (int *)calloc((size_t)n, sizeof(int));
    if (!arr) return 0;
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);
    printf("%d\\n", min_buckets(n, c, arr));
    free(arr);
    return 0;
}
`,
  },

  22: {
    py: () => `from __future__ import annotations

def matrix_gravity(n: int, m: int, rows: list[str], queries: str) -> str:
    # Write your solution here
    return ""

if __name__ == "__main__":
    import sys
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    rows = data[2 : 2 + n]
    q = data[2 + n]
    print(matrix_gravity(n, m, rows, q))
`,
    js: () => `function matrixGravity(n, m, rows, queries) {
  // Write your solution here
  return "";
}

const fs = require("fs");
const data = fs.readFileSync(0, "utf8").trim().split(/\\s+/);
const n = parseInt(data[0], 10);
const m = parseInt(data[1], 10);
const rows = data.slice(2, 2 + n);
const q = data[2 + n];
console.log(matrixGravity(n, m, rows, q));
`,
    java: () => `import java.util.*;
import java.io.*;

public class Main {
    static String matrixGravity(int n, int m, String[] rows, String queries) {
        // Write your solution here
        return "";
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] nm = br.readLine().trim().split("\\\\s+");
        int n = Integer.parseInt(nm[0]);
        int m = Integer.parseInt(nm[1]);
        String[] rows = new String[n];
        for (int i = 0; i < n; i++) rows[i] = br.readLine().trim();
        String queries = br.readLine().trim();
        System.out.println(matrixGravity(n, m, rows, queries));
    }
}
`,
    cpp: () => `#include <bits/stdc++.h>
using namespace std;

string matrixGravity(int n, int m, const vector<string>& rows, const string& queries) {
    // Write your solution here
    return "";
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    cin >> n >> m;
    vector<string> rows(n);
    for (int i = 0; i < n; i++) cin >> rows[i];
    string queries;
    cin >> queries;
    cout << matrixGravity(n, m, rows, queries) << "\\n";
    return 0;
}
`,
    c: () => `#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void matrix_gravity(int n, int m, char **rows, const char *queries, char *out, size_t out_sz) {
    (void)n;
    (void)m;
    (void)rows;
    (void)queries;
    out[0] = '\\0';
    (void)out_sz;
}

int main(void) {
    int n, m;
    if (scanf("%d %d", &n, &m) != 2) return 0;
    char **rows = (char **)calloc((size_t)n, sizeof(char *));
    if (!rows) return 0;
    char buf[4096];
    for (int i = 0; i < n; i++) {
        if (scanf("%4095s", buf) != 1) return 0;
        rows[i] = strdup(buf);
    }
    if (scanf("%4095s", buf) != 1) return 0;
    char out[8192];
    matrix_gravity(n, m, rows, buf, out, sizeof out);
    printf("%s\\n", out);
    for (int i = 0; i < n; i++) free(rows[i]);
    free(rows);
    return 0;
}
`,
  },
};
