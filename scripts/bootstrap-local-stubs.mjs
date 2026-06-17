import fs from "fs";
import path from "path";

const root = path.resolve(process.cwd());
const nm = path.join(root, "node_modules");

const defaultPkgs = {
  "react-router-dom": `import React from "react";
export const BrowserRouter = ({ children }) => React.createElement(React.Fragment, null, children);
export const HashRouter = BrowserRouter;
export const MemoryRouter = BrowserRouter;
export const Routes = ({ children }) => React.createElement(React.Fragment, null, children);
export const Route = ({ children }) => React.createElement(React.Fragment, null, children);
export const Link = ({ to, children, ...props }) => React.createElement("a", { href: typeof to === "string" ? to : "#", ...props }, children);
export const NavLink = Link;
export const Navigate = () => null;
export const Outlet = () => null;
export const useLocation = () => ({ pathname: "/", search: "", hash: "", state: null, key: "stub" });
export const useNavigate = () => () => {};
export const useParams = () => ({});
export const useSearchParams = () => [new URLSearchParams(), () => {}];
export const createBrowserRouter = () => ({});
export const RouterProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const createRoutesFromElements = (children) => children;
export const Form = ({ children }) => React.createElement("form", null, children);`,
  "sonner": `import React from "react";
export const toast = Object.assign((...args) => args, { success: () => {}, error: () => {}, info: () => {}, warning: () => {} });
export const Toaster = () => React.createElement(React.Fragment, null, null);
export default { toast, Toaster };`,
  "react-quill": `import React from "react";
const ReactQuill = React.forwardRef(function ReactQuill(props, ref) {
  return React.createElement("div", { ref, "data-stub": "react-quill" }, props?.children ?? null);
});
export default ReactQuill;`,
  "recharts": `import React from "react";
const make = (name) => React.forwardRef(function Stub(props, ref) {
  return React.createElement("div", { ref, "data-recharts": name, ...props }, props?.children ?? null);
});
export const ResponsiveContainer = make("ResponsiveContainer");
export const BarChart = make("BarChart");
export const Bar = make("Bar");
export const LineChart = make("LineChart");
export const Line = make("Line");
export const AreaChart = make("AreaChart");
export const Area = make("Area");
export const PieChart = make("PieChart");
export const Pie = make("Pie");
export const RadarChart = make("RadarChart");
export const Radar = make("Radar");
export const ScatterChart = make("ScatterChart");
export const Scatter = make("Scatter");
export const ComposedChart = make("ComposedChart");
export const CartesianGrid = make("CartesianGrid");
export const XAxis = make("XAxis");
export const YAxis = make("YAxis");
export const ZAxis = make("ZAxis");
export const Tooltip = make("Tooltip");
export const Legend = make("Legend");
export const Cell = make("Cell");
export const ReferenceLine = make("ReferenceLine");
export const Label = make("Label");
export const LabelList = make("LabelList");
export const PolarGrid = make("PolarGrid");
export const PolarAngleAxis = make("PolarAngleAxis");
export const PolarRadiusAxis = make("PolarRadiusAxis");
export default { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, RadarChart, Radar, ScatterChart, Scatter, ComposedChart, CartesianGrid, XAxis, YAxis, ZAxis, Tooltip, Legend, Cell, ReferenceLine, Label, LabelList, PolarGrid, PolarAngleAxis, PolarRadiusAxis };`,
  "@monaco-editor/react": `import React from "react";
export default function Editor(props) {
  return React.createElement("div", { "data-stub": "monaco-editor" }, props?.children ?? null);
}`,
  "dompurify": `export default { sanitize: (html) => html };`,
  "date-fns": `export const formatDistanceToNow = () => "";`,
  "clsx": `export function clsx(...inputs) { return inputs.flat(Infinity).filter(Boolean).join(" "); }
export default clsx;`,
  "tailwind-merge": `export function twMerge(...inputs) { return inputs.flat(Infinity).filter(Boolean).join(" "); }`,
  "class-variance-authority": `export function cva(base = "") { return () => base; }
export function cx(...inputs) { return inputs.flat(Infinity).filter(Boolean).join(" "); }`,
  "socket.io-client": `export function io() { return { on() {}, off() {}, emit() {}, disconnect() {} }; }
export class Socket { on() {} off() {} emit() {} disconnect() {} }`,
  "@deepgram/sdk": `export const LiveTranscriptionEvents = { Open: "Open", Transcript: "Transcript", Close: "Close", Error: "Error" };
export function createClient() { return { listen: () => ({ subscribe: () => {} }) }; }`,
  "@tensorflow/tfjs": `export async function ready() {}
export async function setBackend() { return true; }
export function tensor() { return {}; }
export function tensor2d() { return {}; }
export async function loadLayersModel() { return {}; }
export async function loadGraphModel() { return {}; }
export const browser = { fromPixels: () => ({}) };`,
  "@tensorflow-models/blazeface": `export async function load() { return { estimateFaces: async () => [] }; }`,
  "@tensorflow-models/coco-ssd": `export async function load() { return { detect: async () => [] }; }`,
  "firebase/app": `export function initializeApp(config) { return { config }; }
export function getApps() { return []; }`,
  "firebase/auth": `export function getAuth() { return {}; }
export function signInWithPopup() { return Promise.resolve({}); }
export function signInWithRedirect() { return Promise.resolve(); }
export function getRedirectResult() { return Promise.resolve(null); }
export class GoogleAuthProvider {}`,
  "react-resizable-panels": `import React from "react";
export function PanelGroup({ children }) { return React.createElement(React.Fragment, null, children); }
export function Panel({ children }) { return React.createElement(React.Fragment, null, children); }
export function PanelResizeHandle() { return React.createElement("div", { "data-stub": "panel-resize-handle" }); }`,
  "@daily-co/daily-js": `export function createFrame() { return {}; }
export default { createFrame };`,
  "@daily-co/daily-react": `import React from "react";
export function DailyProvider({ children }) { return React.createElement(React.Fragment, null, children); }`,
  "@mediapipe/tasks-vision": `export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const VisionRunningMode = { IMAGE: "IMAGE", VIDEO: "VIDEO" };
export class FaceLandmarker { static async createFromOptions() { return new FaceLandmarker(); } }
export class ObjectDetector { static async createFromOptions() { return new ObjectDetector(); } }`,
  "@tanstack/react-query": `import React from "react";
export class QueryClient { constructor(options = {}) { this.options = options; } }
export function QueryClientProvider({ children }) { return React.createElement(React.Fragment, null, children); }
export function useQuery() { return { data: undefined, error: null, isError: false, isLoading: false, isPending: false, refetch: async () => ({ data: undefined, error: null }) }; }
export function useMutation(options = {}) { const mutationFn = options.mutationFn ?? (async () => undefined); return { data: undefined, error: null, isError: false, isPending: false, mutate: (...args) => { void mutationFn(...args); }, mutateAsync: (...args) => mutationFn(...args) }; }
export function useQueryClient() { return new QueryClient(); }`,
  "pdfjs-dist": `export const GlobalWorkerOptions = { workerSrc: "" };
export function getDocument() { return { promise: Promise.resolve({ numPages: 0, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }) }; }`,
};

const radixCommon = [
  "Root",
  "Provider",
  "Slot",
  "Slottable",
  "Portal",
  "Trigger",
  "Content",
  "Overlay",
  "Item",
  "ItemIndicator",
  "ItemText",
  "Label",
  "Group",
  "Separator",
  "Arrow",
  "Close",
  "Viewport",
  "ScrollArea",
  "ScrollUpButton",
  "ScrollDownButton",
  "ScrollAreaScrollbar",
  "ScrollAreaThumb",
  "Corner",
  "Thumb",
  "Track",
  "Range",
  "Indicator",
  "Icon",
  "Value",
  "Text",
  "Title",
  "Description",
  "Action",
  "Cancel",
  "CheckboxItem",
  "Sub",
  "SubTrigger",
  "SubContent",
  "Menu",
  "MenuItem",
  "MenuTrigger",
  "MenuContent",
  "MenuSeparator",
  "MenuGroup",
  "MenuLabel",
  "MenuPortal",
  "MenuCheckboxItem",
  "MenuRadioItem",
  "Checkbox",
  "CheckboxIndicator",
  "RadioGroup",
  "RadioItem",
  "Switch",
  "SwitchThumb",
  "Tabs",
  "List",
  "TabsList",
  "TabsTrigger",
  "TabsContent",
  "Slider",
  "Select",
  "SelectTrigger",
  "SelectValue",
  "SelectContent",
  "SelectItem",
  "SelectGroup",
  "SelectLabel",
  "SelectSeparator",
  "SelectScrollUpButton",
  "SelectScrollDownButton",
  "Dialog",
  "DialogTrigger",
  "DialogContent",
  "DialogOverlay",
  "DialogClose",
  "DialogTitle",
  "DialogDescription",
  "DialogHeader",
  "DialogFooter",
  "DialogBody",
  "Accordion",
  "AccordionItem",
  "AccordionTrigger",
  "AccordionContent",
  "Collapsible",
  "CollapsibleTrigger",
  "CollapsibleContent",
  "HoverCard",
  "HoverCardTrigger",
  "HoverCardContent",
  "Popover",
  "PopoverTrigger",
  "PopoverContent",
  "Tooltip",
  "TooltipProvider",
  "TooltipTrigger",
  "TooltipContent",
  "TooltipArrow",
  "ToastProvider",
  "ToastViewport",
  "Toast",
  "ToastTitle",
  "ToastDescription",
  "ToastAction",
  "ToastClose",
  "NavigationMenu",
  "NavigationMenuList",
  "NavigationMenuItem",
  "NavigationMenuLink",
  "NavigationMenuTrigger",
  "NavigationMenuContent",
  "Menubar",
  "MenubarMenu",
  "MenubarTrigger",
  "MenubarContent",
  "MenubarItem",
  "MenubarCheckboxItem",
  "MenubarRadioItem",
  "MenubarLabel",
  "MenubarSeparator",
  "MenubarShortcut",
  "Toggle",
  "ToggleGroup",
  "ToggleGroupItem",
  "AspectRatio",
  "Avatar",
  "AvatarImage",
  "AvatarFallback",
  "Image",
  "Fallback",
  "Progress",
  "Breadcrumb",
  "BreadcrumbItem",
  "BreadcrumbLink",
  "BreadcrumbList",
  "BreadcrumbPage",
  "BreadcrumbSeparator",
  "Command",
  "CommandInput",
  "CommandList",
  "CommandEmpty",
  "CommandGroup",
  "CommandItem",
  "CommandShortcut",
  "SeparatorHorizontal",
  "SeparatorVertical",
  "ResizablePanelGroup",
  "ResizablePanel",
  "ResizableHandle",
];

const radixPackages = [
  "@radix-ui/react-accordion",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-label",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toast",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-tooltip",
];

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeRadixStub(name) {
  return `import React from "react";
const factory = (tag) => React.forwardRef(function Stub(props, ref) {
  return React.createElement(tag, { ref, ...props }, props?.children ?? null);
});
${radixCommon.map((n) => `export const ${n} = factory("div");`).join("\n")}
export default { ${radixCommon.join(", ")} };`;
}

const lucideNames = new Set();
const reactRouterNames = new Set([
  "BrowserRouter",
  "Routes",
  "Route",
  "Link",
  "NavLink",
  "Navigate",
  "Outlet",
  "useLocation",
  "useNavigate",
  "useParams",
  "useSearchParams",
  "HashRouter",
  "MemoryRouter",
  "RouterProvider",
  "createBrowserRouter",
  "createRoutesFromElements",
  "Form",
]);

const sourceRoots = [path.join(root, "src")];
for (const sourceRoot of sourceRoots) {
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/[jt]sx?$/.test(ent.name)) {
        const txt = fs.readFileSync(p, "utf8");
        const importRe = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = importRe.exec(txt))) {
          const spec = m[1].trim();
          const pkg = m[2];
          const names = spec
            .replace(/^\{/, "")
            .replace(/\}$/, "")
            .split(",")
            .map((s) => s.trim().split(/\s+as\s+/i).pop())
            .filter(Boolean);
          if (pkg === "lucide-react") {
            names.forEach((n) => lucideNames.add(n));
          }
          if (pkg === "react-router-dom") {
            names.forEach((n) => reactRouterNames.add(n));
          }
        }
      }
    }
  };
  walk(sourceRoot);
}

function makeLucideStub(names) {
  const iconExports = [...names].sort().map((n) => `export const ${n} = makeIcon("${n}");`).join("\n");
  return `import React from "react";
const makeIcon = (name) => React.forwardRef(function Icon(props, ref) {
  return React.createElement("svg", { ref, "data-icon": name, ...props }, null);
});
${iconExports}
export default { ${[...names].sort().join(", ")} };`;
}

function makeReactRouterStub(names) {
  const exports = [...names].sort().map((n) => {
    if (n.startsWith("use")) {
      switch (n) {
        case "useLocation":
          return `export const useLocation = () => ({ pathname: "/", search: "", hash: "", state: null, key: "stub" });`;
        case "useNavigate":
          return `export const useNavigate = () => () => {};`;
        case "useParams":
          return `export const useParams = () => ({});`;
        case "useSearchParams":
          return `export const useSearchParams = () => [new URLSearchParams(), () => {}];`;
        default:
          return `export const ${n} = () => ({});`;
      }
    }
    if (n === "Navigate") return `export const Navigate = () => null;`;
    if (n === "Routes" || n === "Route" || n === "Outlet" || n === "RouterProvider" || n === "BrowserRouter" || n === "HashRouter" || n === "MemoryRouter" || n === "Form") {
      return `export const ${n} = ({ children }) => React.createElement(React.Fragment, null, children);`;
    }
    if (n === "Link" || n === "NavLink") {
      return `export const ${n} = ({ to, children, ...props }) => React.createElement("a", { href: typeof to === "string" ? to : "#", ...props }, children);`;
    }
    return `export const ${n} = (...args) => args;`;
  }).join("\n");
  const extra = [];
  if (!names.has("createBrowserRouter")) extra.push(`export const createBrowserRouter = () => ({});`);
  if (!names.has("createRoutesFromElements")) extra.push(`export const createRoutesFromElements = (children) => children;`);
  return `import React from "react";
${exports}
${extra.join("\n")}`;
}

function makeSimpleStub(extra = "") {
  return `import React from "react";
${extra}`;
}

for (const [pkg, content] of Object.entries(defaultPkgs)) {
  if (pkg.includes("/")) {
    const [scope, sub] = pkg.split("/", 2);
    const dir = path.join(nm, scope, sub);
    const exportsField = pkg === "react-quill" ? { ".": "./index.js", "./dist/quill.snow.css": "./dist/quill.snow.css" } : "./index.js";
    writeFile(path.join(dir, "package.json"), JSON.stringify({ name: pkg, version: "0.0.0", type: "module", main: "./index.js", exports: exportsField }, null, 2));
    writeFile(path.join(dir, "index.js"), content);
    if (pkg === "react-quill") {
      writeFile(path.join(dir, "dist", "quill.snow.css"), "");
    }
  } else {
    const dir = path.join(nm, pkg);
    const exportsField = pkg === "react-quill" ? { ".": "./index.js", "./dist/quill.snow.css": "./dist/quill.snow.css" } : "./index.js";
    writeFile(path.join(dir, "package.json"), JSON.stringify({ name: pkg, version: "0.0.0", type: "module", main: "./index.js", exports: exportsField }, null, 2));
    writeFile(path.join(dir, "index.js"), content);
    if (pkg === "react-quill") {
      writeFile(path.join(dir, "dist", "quill.snow.css"), "");
    }
  }
}

writeFile(path.join(nm, "firebase", "package.json"), JSON.stringify({
  name: "firebase",
  version: "0.0.0",
  type: "module",
  exports: {
    "./app": "./app/index.js",
    "./auth": "./auth/index.js",
  },
}, null, 2));

for (const pkg of radixPackages) {
  const dir = path.join(nm, pkg.split("/")[0], pkg.split("/")[1]);
  writeFile(path.join(dir, "package.json"), JSON.stringify({ name: pkg, version: "0.0.0", type: "module", main: "./index.js", exports: "./index.js" }, null, 2));
  writeFile(path.join(dir, "index.js"), makeRadixStub(pkg));
}

writeFile(path.join(nm, "lucide-react", "package.json"), JSON.stringify({ name: "lucide-react", version: "0.0.0", type: "module", main: "./index.js", exports: "./index.js" }, null, 2));
writeFile(path.join(nm, "lucide-react", "index.js"), makeLucideStub(lucideNames));

writeFile(path.join(nm, "react-router-dom", "package.json"), JSON.stringify({ name: "react-router-dom", version: "0.0.0", type: "module", main: "./index.js", exports: "./index.js" }, null, 2));
writeFile(path.join(nm, "react-router-dom", "index.js"), makeReactRouterStub(reactRouterNames));

// Ensure the simple package stubs remain available if npm had left empty dirs behind.
for (const pkg of ["sonner", "recharts", "clsx", "tailwind-merge", "class-variance-authority", "date-fns", "dompurify", "socket.io-client", "@deepgram/sdk", "@tensorflow/tfjs", "@tensorflow-models/blazeface", "@tensorflow-models/coco-ssd", "firebase/app", "firebase/auth", "@daily-co/daily-js", "@daily-co/daily-react", "@mediapipe/tasks-vision", "@monaco-editor/react", "@tanstack/react-query"]) {
  const [a, b] = pkg.startsWith("@") ? pkg.split("/", 2) : [pkg, null];
  const dir = b ? path.join(nm, a, b) : path.join(nm, a);
  const file = b ? path.join(dir, "package.json") : path.join(dir, "package.json");
  if (!fs.existsSync(file)) {
    writeFile(file, JSON.stringify({ name: pkg, version: "0.0.0", type: "module", main: "./index.js", exports: "./index.js" }, null, 2));
  }
}

console.log("Local stubs written.");
