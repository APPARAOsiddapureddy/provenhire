import { Component, useCallback, useRef, type ReactNode } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { ProgrammingLanguage } from "@/data/dsaQuestions";
import { Loader2 } from "lucide-react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: ProgrammingLanguage;
  readOnly?: boolean;
  height?: string;
}

// Map our language types to Monaco language IDs
const languageMap: Record<ProgrammingLanguage, string> = {
  javascript: "javascript",
  python: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
};

const CodeEditor = ({
  value,
  onChange,
  language,
  readOnly = false,
  height = "400px",
}: CodeEditorProps) => {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    try {
      editorRef.current = editor;

      // Define custom dark theme (safe for all languages)
      monaco.editor.defineTheme("provenhire-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "comment", foreground: "6A9955", fontStyle: "italic" },
          { token: "keyword", foreground: "C586C0" },
          { token: "string", foreground: "CE9178" },
          { token: "number", foreground: "B5CEA8" },
          { token: "type", foreground: "4EC9B0" },
          { token: "function", foreground: "DCDCAA" },
          { token: "variable", foreground: "9CDCFE" },
          { token: "class", foreground: "4EC9B0" },
        ],
        colors: {
          "editor.background": "#0a0a0f",
          "editor.foreground": "#D4D4D4",
          "editor.lineHighlightBackground": "#1a1a2e",
          "editorLineNumber.foreground": "#5A5A5A",
          "editorLineNumber.activeForeground": "#C6C6C6",
          "editorCursor.foreground": "#A855F7",
          "editor.selectionBackground": "#264F78",
          "editor.inactiveSelectionBackground": "#3A3D41",
          "editorIndentGuide.background1": "#404040",
          "editorIndentGuide.activeBackground1": "#707070",
          "editorBracketMatch.background": "#0D3A58",
          "editorBracketMatch.border": "#888888",
          "scrollbarSlider.background": "#4a4a5a50",
          "scrollbarSlider.hoverBackground": "#5a5a6a80",
          "scrollbarSlider.activeBackground": "#6a6a7a90",
        },
      });

      monaco.editor.setTheme("provenhire-dark");

      // TypeScript/JavaScript-specific config (only for JS; Python/Java/C++/C use their own language services)
      if (language === "javascript") {
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
        });
        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
          target: monaco.languages.typescript.ScriptTarget.ES2020,
          allowNonTsExtensions: true,
          moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          lib: ["ES2020"],
        });
      }
    } catch (err) {
      // Prevent any Monaco config error from breaking the editor; it will still work with defaults
      console.warn("[CodeEditor] onMount config warning:", err);
    }
  };

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onChange(value || "");
    },
    [onChange]
  );

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <Editor
        height={height}
        language={languageMap[language]}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex items-center justify-center h-full bg-[#0a0a0f] text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading editor...
          </div>
        }
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          lineNumbers: "on",
          renderLineHighlight: "all",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          wordWrap: "on",
          wrappingIndent: "indent",
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
          padding: { top: 16, bottom: 16 },
          bracketPairColorization: { enabled: true },
          matchBrackets: "always",
          autoClosingBrackets: "always",
          autoClosingQuotes: "always",
          autoIndent: "full",
          formatOnPaste: true,
          formatOnType: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
          parameterHints: { enabled: true },
          suggest: {
            showWords: true,
            showSnippets: true,
            showKeywords: true,
            showFunctions: true,
            showVariables: true,
            showClasses: true,
            showInterfaces: true,
          },
          folding: true,
          foldingStrategy: "indentation",
          showFoldingControls: "mouseover",
          guides: {
            indentation: true,
            bracketPairs: true,
            highlightActiveBracketPair: true,
          },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          renderWhitespace: "selection",
          contextmenu: true,
          mouseWheelZoom: true,
          links: true,
          colorDecorators: true,
        }}
      />
    </div>
  );
};

/** Fallback textarea when Monaco fails to load (e.g. slow network, unsupported browser) */
function CodeEditorFallback({
  value,
  onChange,
  readOnly,
  height,
}: Pick<CodeEditorProps, "value" | "onChange" | "readOnly" | "height">) {
  const h = height ?? "400px";
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-[#0a0a0f]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="w-full p-4 font-mono text-sm text-[#D4D4D4] bg-transparent resize-none focus:outline-none focus:ring-0"
        style={{ height: h, minHeight: h }}
        spellCheck={false}
        placeholder="Write your code here..."
      />
    </div>
  );
}

/** Error boundary: if Monaco throws, show textarea fallback so the user can still code */
class EditorErrorBoundary extends Component<
  { children: ReactNode; fallbackProps: Pick<CodeEditorProps, "value" | "onChange" | "readOnly" | "height"> },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[CodeEditor] Monaco failed, using fallback:", error);
  }

  render() {
    if (this.state.hasError) {
      return <CodeEditorFallback {...this.props.fallbackProps} />;
    }
    return this.props.children;
  }
}

/** CodeEditor with fallback: never blocks the user even if Monaco fails */
function CodeEditorWithFallback(props: CodeEditorProps) {
  return (
    <EditorErrorBoundary fallbackProps={{ value: props.value, onChange: props.onChange, readOnly: props.readOnly, height: props.height }}>
      <CodeEditor {...props} />
    </EditorErrorBoundary>
  );
}

export default CodeEditorWithFallback;
export { CodeEditor };
