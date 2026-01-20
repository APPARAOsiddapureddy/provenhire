import { useCallback, useRef } from "react";
import Editor, { OnMount, Monaco } from "@monaco-editor/react";
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
    editorRef.current = editor;

    // Define custom dark theme
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

    // Configure language-specific features
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

export default CodeEditor;
