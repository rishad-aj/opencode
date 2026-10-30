import React, { useState, useEffect, useRef } from 'react';
import {
  Square,
  Plus,
  ChevronDown,
  ChevronRight,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  Search,
  ArrowUp,
  X,
  Palette,
  Terminal,
  Trash2,
  Globe
} from 'lucide-react';
import { MarkdownRenderer } from './components/MarkdownRenderer';

interface FreeModel {
  id: string;
  fullId: string;
  name: string;
  family: string;
  contextLimit: number;
  outputLimit: number;
  reasoning: boolean;
  speedLabel: string;
  description: string;
}

interface ToolEventItem {
  id: string;
  name: string;
  input?: Record<string, any>;
  title?: string;
  status: 'running' | 'done' | 'error';
  error?: string;
}

type MessageSegment =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'tool'; tool: ToolEventItem };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  model: string;
  agent: 'build' | 'plan';
  timestamp: number;
  durationMs?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
  };
  tools?: ToolEventItem[];
  /** Ordered stream output: text and tool calls interleaved exactly as received. */
  segments?: MessageSegment[];
  error?: string;
}

interface ChatThread {
  id: string;
  opencodeSessionID?: string;
  title: string;
  modelId: string;
  agent: 'build' | 'plan';
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface WorkspaceFile {
  path: string;
  size: number;
  updatedAt: number;
}

type ThemeId =
  | 'opencode'
  | 'ios-light'
  | 'ios-dark'
  | 'ios-auto'
  | 'tokyonight'
  | 'catppuccin'
  | 'gruvbox'
  | 'dracula'
  | 'vesper'
  | 'vercel';

interface ThemeOption {
  id: ThemeId;
  name: string;
  category: 'Terminal UI' | 'iOS UI';
  badge: string;
  description: string;
  swatches: [string, string, string];
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'opencode',
    name: 'opencode',
    category: 'Terminal UI',
    badge: 'default',
    description: 'Official OpenCode v2.2.1 TUI dark theme (#0a0a0a base, #141414 raised, #fab283 Build, #9d7cd8 Plan).',
    swatches: ['#0a0a0a', '#fab283', '#9d7cd8']
  },
  {
    id: 'ios-light',
    name: 'ios (Apple Messages Light)',
    category: 'iOS UI',
    badge: 'ios',
    description: 'Bug-fixed Apple Messages light theme — white canvas, #0b84ff blue & #e9e9eb gray bubbles.',
    swatches: ['#ffffff', '#0b84ff', '#e9e9eb']
  },
  {
    id: 'ios-dark',
    name: 'ios-dark (Apple Messages Dark)',
    category: 'iOS UI',
    badge: 'ios',
    description: 'Bug-fixed Apple Messages OLED dark theme — black canvas, #0a84ff blue & #26262a bubbles.',
    swatches: ['#000000', '#0a84ff', '#26262a']
  },
  {
    id: 'ios-auto',
    name: 'ios-auto (Apple Messages System)',
    category: 'iOS UI',
    badge: 'ios',
    description: 'Bug-fixed Apple Messages UI that automatically tracks system light/dark mode.',
    swatches: ['#f2f2f7', '#0b84ff', '#1c1c1e']
  },
  {
    id: 'tokyonight',
    name: 'tokyonight',
    category: 'Terminal UI',
    badge: 'tui',
    description: 'Official OpenCode Tokyo Night TUI theme (#1a1b26 base, #82aaff Build, #c099ff Plan).',
    swatches: ['#1a1b26', '#82aaff', '#c099ff']
  },
  {
    id: 'catppuccin',
    name: 'catppuccin',
    category: 'Terminal UI',
    badge: 'tui',
    description: 'Official OpenCode Catppuccin Mocha TUI theme (#1e1e2e base, #89b4fa Build, #cba6f7 Plan).',
    swatches: ['#1e1e2e', '#89b4fa', '#cba6f7']
  },
  {
    id: 'gruvbox',
    name: 'gruvbox',
    category: 'Terminal UI',
    badge: 'tui',
    description: 'Official OpenCode Gruvbox TUI theme (#282828 base, #83a598 Build, #d3869b Plan).',
    swatches: ['#282828', '#83a598', '#d3869b']
  },
  {
    id: 'dracula',
    name: 'dracula',
    category: 'Terminal UI',
    badge: 'tui',
    description: 'Official OpenCode Dracula TUI theme (#282a36 base, #bd93f9 Build, #ff79c6 Plan).',
    swatches: ['#282a36', '#bd93f9', '#ff79c6']
  },
  {
    id: 'vesper',
    name: 'vesper',
    category: 'Terminal UI',
    badge: 'tui',
    description: 'Official OpenCode Vesper TUI theme (#101010 base, #ffc799 Build, #99ffe4 Plan).',
    swatches: ['#101010', '#ffc799', '#99ffe4']
  },
  {
    id: 'vercel',
    name: 'vercel',
    category: 'Terminal UI',
    badge: 'tui',
    description: 'Official OpenCode Vercel Geist TUI theme (#000000 base, #0070f3 Build, #52a8ff Plan).',
    swatches: ['#000000', '#0070f3', '#52a8ff']
  }
];

const STORAGE_KEY = 'opas_labs_opencode_threads_v1';
const GATEWAY_STORAGE_KEY = 'opas_labs_opencode_gateway_v1';
const THEME_STORAGE_KEY = 'opas_labs_ui_theme_v2';
const DEFAULT_CLOUD_GATEWAY =
  'https://ais-pre-moyn6njhb5ohau3ewpjnlf-915588455808.asia-east1.run.app';

// Seamless corner-attached iMessage bubble tail path (11x16 viewBox)
const TAIL_PATH = 'M0,0 C0,8 2.2,13.6 10.5,16 C4.5,16 1.2,14.2 0,11.2 Z';

// iOS system palette
const APPLE_BLUE = '#0b84ff';
const APPLE_GREEN = '#34c759';
const APPLE_RED = '#ff3b30';
const APPLE_INDIGO = '#5856d6';

const VERCEL_JSON_CONFIG = `{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "${DEFAULT_CLOUD_GATEWAY}/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}`;

const GITHUB_WORKFLOW_YAML = `name: Deploy OPAS Labs OpenCode to GitHub Pages

on:
  push:
    branches: ["main", "master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - run: npm install
      - name: Build static bundle
        run: |
          npm run build
          cp dist/index.html dist/404.html
          touch dist/.nojekyll
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "./dist"

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4`;

const OPENCODE_PLACEHOLDERS = [
  'Fix a TODO in the codebase',
  'What is the tech stack of this project?',
  'Fix broken tests'
];

/** Compact OpenCode "bracket" mark */
function MarkGlyph({ className = 'h-5 w-auto' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 36"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 30H6V18H18V30Z" fill="#ffffff" />
      <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

/** Official OpenCode vector wordmark */
function OpenCodeWordmark({ className = 'h-4 w-auto' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      aria-label="OpenCode"
      role="img"
      className={className}
    >
      <path d="M18 30H6V18H18V30Z" fill="#343434" />
      <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="#7e7e7e" />
      <path d="M48 30H36V18H48V30Z" fill="#343434" />
      <path d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z" fill="#7e7e7e" />
      <path d="M84 24V30H66V24H84Z" fill="#343434" />
      <path d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z" fill="#7e7e7e" />
      <path d="M108 36H96V18H108V36Z" fill="#343434" />
      <path d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z" fill="#7e7e7e" />
      <path d="M144 30H126V18H144V30Z" fill="#343434" />
      <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="#ededed" />
      <path d="M168 30H156V18H168V30Z" fill="#343434" />
      <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="#ededed" />
      <path d="M198 30H186V18H198V30Z" fill="#343434" />
      <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="#ededed" />
      <path d="M234 24V30H216V24H234Z" fill="#343434" />
      <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="#ededed" />
    </svg>
  );
}

/**
 * Exact 1:1 port of `function _U()` (`vy.left` + `vy.right`) from the official OpenCode v2.2.1 TUI binary.
 * Renders the 39x7 half-block terminal matrix with `shapeRendering="crispEdges"` so every `█`, `▀`, `▄`,
 * and 25% shadow cell (`_`, `^`, `~`) aligns with zero font-metric seams across all TUI themes.
 */
function OfficialTuiLogo({ className = 'h-[52px] sm:h-[60px] w-auto' }: { className?: string }) {
  return (
    <div className="flex flex-col items-center select-none">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 234 42"
        fill="none"
        shapeRendering="crispEdges"
        aria-label="opencode"
        role="img"
        className={className}
      >
        {/* Left ("open") 25% shadow cells (`_`, `^`, `~`) */}
        <path d="M18 30H6V18H18V30Z" fill="var(--oc-shadow-left)" />
        <path d="M48 30H36V18H48V30Z" fill="var(--oc-shadow-left)" />
        <path d="M84 24V30H66V24H84Z" fill="var(--oc-shadow-left)" />
        <path d="M108 36H96V18H108V36Z" fill="var(--oc-shadow-left)" />

        {/* Left ("open") foreground block cells (`t.text.muted`) */}
        <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="var(--oc-fg-muted)" />
        <path d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z" fill="var(--oc-fg-muted)" />
        <path d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z" fill="var(--oc-fg-muted)" />
        <path d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z" fill="var(--oc-fg-muted)" />

        {/* Right ("code") 25% shadow cells (`_`, `^`) */}
        <path d="M144 30H126V18H144V30Z" fill="var(--oc-shadow-right)" />
        <path d="M168 30H156V18H168V30Z" fill="var(--oc-shadow-right)" />
        <path d="M198 30H186V18H198V30Z" fill="var(--oc-shadow-right)" />
        <path d="M234 24V30H216V24H234Z" fill="var(--oc-shadow-right)" />

        {/* Right ("code") foreground block cells (`t.text.base`) */}
        <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="var(--oc-fg)" />
        <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="var(--oc-fg)" />
        <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="var(--oc-fg)" />
        <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="var(--oc-fg)" />
      </svg>
    </div>
  );
}

const SLASH_COMMANDS = [
  { cmd: '/themes', title: 'Switch theme', category: 'System', desc: 'Switch between official OpenCode TUI themes & iOS Messages theme', keybind: 'ctrl+k' },
  { cmd: '/models', title: 'Switch model', category: 'Agent', desc: 'Select an OpenCode Zen free model', keybind: 'ctrl+m' },
  { cmd: '/agent', title: 'Switch agent', category: 'Agent', desc: 'Toggle between Build and Plan agent', keybind: 'tab' },
  { cmd: '/new', title: 'New session', category: 'Session', desc: 'Start a fresh OpenCode session', keybind: 'ctrl+n' },
  { cmd: '/sessions', title: 'Switch session', category: 'Session', desc: 'Browse or resume saved sessions', keybind: 'ctrl+s' },
  { cmd: '/files', title: 'Workspace files', category: 'Workspace', desc: 'Inspect /tmp/opencode-workspace files', keybind: 'ctrl+f' },
  { cmd: '/sidebar', title: 'Toggle sidebar', category: 'System', desc: 'Show or hide the session context & MCP sidebar', keybind: 'ctrl+b' },
  { cmd: '/vercel', title: 'Vercel & Gateway', category: 'System', desc: 'Configure Vercel / GitHub Pages & cloud gateway URL', keybind: 'ctrl+g' },
  { cmd: '/clear', title: 'Clear session', category: 'Session', desc: 'Clear current session messages', keybind: 'ctrl+l' }
];

const STARTER_PROMPTS = [
  {
    title: 'Write a TS rate limiter',
    agent: 'build' as const,
    prompt:
      'Write a production-ready sliding window rate limiter in TypeScript with zero external dependencies and unit tests. Reply directly in markdown.'
  },
  {
    title: 'Benchmark Map vs Object',
    agent: 'build' as const,
    prompt:
      'Create a file named benchmark.js in the workspace that benchmarks Map vs Object lookup speed in Node.js, run it, and report the exact numbers.'
  },
  {
    title: 'Explain composite indexes',
    agent: 'plan' as const,
    prompt:
      'Explain how composite B-Tree indexes work in PostgreSQL when filtering by equality on one column and range on a second column, with concrete EXPLAIN examples.'
  },
  {
    title: 'Build a useSSEStream hook',
    agent: 'build' as const,
    prompt:
      'Write a clean React useSSEStream hook in TypeScript with automatic reconnection, AbortController cleanup, and typed event callbacks.'
  }
];

function createEmptyThread(
  modelId = 'glm-5.3-flash-free',
  agent: 'build' | 'plan' = 'build'
): ChatThread {
  const now = Date.now();
  return {
    id: 'thr_' + now + '_' + Math.random().toString(36).slice(2, 7),
    title: 'New session',
    modelId,
    agent,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const agentTint = (agent: 'build' | 'plan') => (agent === 'build' ? APPLE_BLUE : APPLE_INDIGO);

const newSegmentId = () =>
  'seg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Append streamed text to the trailing text segment (or open a new one after a tool call). */
function appendTextSegment(msg: ChatMessage, delta: string): ChatMessage {
  if (!delta) return msg;
  const segments = [...(msg.segments || [])];
  const last = segments[segments.length - 1];
  if (last && last.kind === 'text') {
    segments[segments.length - 1] = { ...last, text: last.text + delta };
  } else {
    segments.push({ id: newSegmentId(), kind: 'text', text: delta });
  }
  return { ...msg, segments, content: msg.content + delta };
}

/** Update a tool in both the flat list and its ordered segment. */
function patchTool(
  msg: ChatMessage,
  toolId: string,
  patch: Partial<ToolEventItem>
): ChatMessage {
  return {
    ...msg,
    tools: (msg.tools || []).map((t) => (t.id === toolId ? { ...t, ...patch } : t)),
    segments: (msg.segments || []).map((s) =>
      s.kind === 'tool' && s.tool.id === toolId ? { ...s, tool: { ...s.tool, ...patch } } : s
    )
  };
}

export default function App() {
  const [models, setModels] = useState<FreeModel[]>([
    {
      id: 'glm-5.3-flash-free',
      fullId: 'opencode/glm-5.3-flash-free',
      name: 'GLM-5.3 Flash Free',
      family: 'GLM Flash',
      contextLimit: 1000000,
      outputLimit: 131072,
      reasoning: true,
      speedLabel: '~1.4s',
      description: 'High-speed 1M-context reasoning & coding model hosted on OpenCode Zen.'
    },
    {
      id: 'deepseek-v4.1-flash-free',
      fullId: 'opencode/deepseek-v4.1-flash-free',
      name: 'DeepSeek V4.1 Flash Free',
      family: 'DeepSeek V4',
      contextLimit: 256000,
      outputLimit: 65536,
      reasoning: true,
      speedLabel: '~1.7s',
      description:
        'Fast chain-of-thought software engineering and debugging model on OpenCode Zen.'
    },
    {
      id: 'mimo-v2.6-flash-free',
      fullId: 'opencode/mimo-v2.6-flash-free',
      name: 'MiMo V2.6 Flash Free',
      family: 'MiMo Flash',
      contextLimit: 256000,
      outputLimit: 65536,
      reasoning: true,
      speedLabel: '~2.1s',
      description: 'Balanced reasoning and code generation specialist with tool execution.'
    },
    {
      id: 'big-pickle',
      fullId: 'opencode/big-pickle',
      name: 'Big Pickle',
      family: 'OpenCode Native',
      contextLimit: 200000,
      outputLimit: 65536,
      reasoning: true,
      speedLabel: '~3.8s',
      description:
        'OpenCode Zen flagship free coding model tuned for multi-step agentic workflows.'
    },
    {
      id: 'nemotron-3.5-lightning-free',
      fullId: 'opencode/nemotron-3.5-lightning-free',
      name: 'Nemotron 3.5 Lightning Free',
      family: 'NVIDIA Nemotron',
      contextLimit: 256000,
      outputLimit: 65536,
      reasoning: true,
      speedLabel: '~1.6s',
      description: 'Ultra-low-latency instruction and code synthesis model.'
    },
    {
      id: 'flint-40b-free',
      fullId: 'opencode/flint-40b-free',
      name: 'Flint 40B Free',
      family: 'Flint',
      contextLimit: 128000,
      outputLimit: 32768,
      reasoning: true,
      speedLabel: '~1.9s',
      description: 'Dense 40B parameter model for clean code refactoring and systems programming.'
    },
    {
      id: 'beam-free',
      fullId: 'opencode/beam-free',
      name: 'Beam Free',
      family: 'Beam',
      contextLimit: 128000,
      outputLimit: 32768,
      reasoning: false,
      speedLabel: '~1.4s',
      description: 'Direct, non-thinking fast response model for instant answers and snippets.'
    }
  ]);

  const [threads, setThreads] = useState<ChatThread[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Strip out any stale "Failed to fetch" broken turns from previous sessions
          const cleaned = parsed.map((t: ChatThread) => {
            if (!Array.isArray(t.messages) || t.messages.length === 0) return t;
            const filtered: ChatMessage[] = [];
            for (let i = 0; i < t.messages.length; i++) {
              const cur = t.messages[i];
              const next = t.messages[i + 1];
              if (
                cur.role === 'user' &&
                next &&
                next.role === 'assistant' &&
                !next.content?.trim() &&
                next.error &&
                /failed to fetch|connection interrupted/i.test(next.error)
              ) {
                i++; // skip broken user+assistant pair
                continue;
              }
              if (
                cur.role === 'assistant' &&
                !cur.content?.trim() &&
                cur.error &&
                /failed to fetch|connection interrupted/i.test(cur.error)
              ) {
                continue;
              }
              filtered.push(cur);
            }
            return {
              ...t,
              title: filtered.length === 0 ? 'New session' : t.title,
              messages: filtered
            };
          });
          return cleaned;
        }
      }
    } catch {
      // ignore storage errors
    }
    return [createEmptyThread()];
  });

  const [activeThreadId, setActiveThreadId] = useState<string>(() => threads[0]?.id || '');
  const [activeNav, setActiveNav] = useState<'workspace' | 'files' | 'models' | 'sessions'>(
    'workspace'
  );
  const [inputPrompt, setInputPrompt] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [showModelModal, setShowModelModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showTuiSidebar, setShowTuiSidebar] = useState(true);
  const [modelSearch, setModelSearch] = useState('');
  const [themeSearch, setThemeSearch] = useState('');
  const [commandSearch, setCommandSearch] = useState('');
  const [copiedWorkflow, setCopiedWorkflow] = useState(false);
  const [copiedVercelJson, setCopiedVercelJson] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Default UI theme is 'opencode' (the official OpenCode Terminal UI)
  const [uiTheme, setUiTheme] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
      if (saved && THEME_OPTIONS.some((t) => t.id === saved)) return saved;
    } catch {
      // ignore
    }
    return 'opencode';
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, uiTheme);
    } catch {
      // ignore
    }
  }, [uiTheme]);

  // Animate OpenCode TUI block knight-rider spinner when streaming
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % 8);
    }, 90);
    return () => clearInterval(id);
  }, [isStreaming]);

  const isIosTheme =
    uiTheme === 'ios-light' || uiTheme === 'ios-dark' || uiTheme === 'ios-auto';
  const iosAppearance: 'light' | 'dark' | 'auto' =
    uiTheme === 'ios-dark' ? 'dark' : uiTheme === 'ios-auto' ? 'auto' : 'light';

  // Automatic static host detection (github.io, custom static hosts) + remote OpenCode gateway URL
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      // Always use same-origin /api/* on local dev, Cloud Run (.run.app), and Vercel (.vercel.app)
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.run.app') ||
        host.endsWith('.vercel.app')
      ) {
        try {
          localStorage.removeItem(GATEWAY_STORAGE_KEY);
        } catch {
          // ignore
        }
        return '';
      }
      if (
        host.endsWith('github.io') ||
        host.endsWith('pages.dev') ||
        host.endsWith('netlify.app')
      ) {
        return DEFAULT_CLOUD_GATEWAY;
      }
    }
    try {
      const saved = localStorage.getItem(GATEWAY_STORAGE_KEY);
      if (saved !== null) return saved.replace(/\/+$/, '');
    } catch {
      // ignore
    }
    return '';
  });
  const [gatewayInput, setGatewayInput] = useState<string>(
    () => apiBaseUrl || DEFAULT_CLOUD_GATEWAY
  );

  const buildApiUrl = (routePath: string, baseOverride?: string) => {
    const base = (baseOverride ?? apiBaseUrl).replace(/\/+$/, '');
    return base ? `${base}${routePath}` : routePath;
  };

  // Workspace Sandbox state
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('README.md');
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const prevThreadIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];
  const selectedModel = models.find((m) => m.id === activeThread?.modelId) || models[0];
  const currentThemeObj =
    THEME_OPTIONS.find((t) => t.id === uiTheme) || THEME_OPTIONS[0];

  const trimmedInput = inputPrompt.trimStart();
  const showSlashMenu = trimmedInput.startsWith('/') && !trimmedInput.includes(' ');
  const matchingSlashCommands = showSlashMenu
    ? SLASH_COMMANDS.filter(
        (c) =>
          c.cmd.startsWith(trimmedInput.toLowerCase()) ||
          (trimmedInput.toLowerCase() === '/theme' && c.cmd === '/themes') ||
          (trimmedInput.toLowerCase() === '/github' && c.cmd === '/vercel') ||
          (trimmedInput.toLowerCase() === '/help' && c.cmd === '/themes')
      )
    : [];

  // Cycle placeholder just like the OpenCode TUI
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % OPENCODE_PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch {
      // ignore storage quota errors
    }
  }, [threads]);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(buildApiUrl('/api/models'));
          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('application/json')) {
            throw new Error('Models endpoint not ready');
          }
          const data = await res.json();
          if (!cancelled && Array.isArray(data?.models) && data.models.length > 0) {
            setModels(data.models);
          }
          return;
        } catch {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      }
    }
    loadModels();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  // Global keyboard shortcuts matching Official OpenCode TUI (ctrl+p commands, ctrl+k themes, ctrl+m models, tab agent)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowCommandModal((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowModelModal((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowThemeModal((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setShowDeployModal((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewSession();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (isIosTheme) {
          setActiveNav((prev) => (prev === 'files' ? 'workspace' : 'files'));
        } else {
          fetchWorkspaceFiles();
          setShowFilesModal((prev) => !prev);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isIosTheme) {
          setActiveNav((prev) => (prev === 'sessions' ? 'workspace' : 'sessions'));
        } else {
          setShowSessionsModal((prev) => !prev);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setShowTuiSidebar((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleClearCurrentSession();
      } else if (e.key === 'Escape') {
        if (showCommandModal) {
          setShowCommandModal(false);
        } else if (showThemeModal) {
          setShowThemeModal(false);
        } else if (showModelModal) {
          setShowModelModal(false);
        } else if (showFilesModal) {
          setShowFilesModal(false);
        } else if (showSessionsModal) {
          setShowSessionsModal(false);
        } else if (showDeployModal) {
          setShowDeployModal(false);
        } else if (isStreaming) {
          handleStopGeneration();
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [
    showCommandModal,
    showModelModal,
    showDeployModal,
    showThemeModal,
    showFilesModal,
    showSessionsModal,
    isStreaming,
    isIosTheme,
    selectedModel.id,
    activeThread?.agent
  ]);

  const fetchWorkspaceFiles = async (selectPath?: string) => {
    setLoadingFiles(true);
    try {
      const res = await fetch(buildApiUrl('/api/workspace/files'));
      const data = await res.json();
      if (Array.isArray(data?.files)) {
        setWorkspaceFiles(data.files);
        const target = selectPath || selectedFilePath || data.files[0]?.path;
        if (target) {
          setSelectedFilePath(target);
          const fRes = await fetch(
            buildApiUrl(`/api/workspace/file?path=${encodeURIComponent(target)}`)
          );
          if (fRes.ok) {
            const fData = await fRes.json();
            setSelectedFileContent(fData.content || '');
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceFiles();
  }, []);

  useEffect(() => {
    if (activeNav === 'files' || showFilesModal) {
      fetchWorkspaceFiles();
    }
  }, [activeNav, showFilesModal]);

  const lastMessage = activeThread?.messages[activeThread.messages.length - 1];
  const streamTick = lastMessage
    ? lastMessage.content.length +
      (lastMessage.reasoning?.length || 0) +
      (lastMessage.segments?.length || 0)
    : 0;

  // Keep transcript scrolled to bottom when opening a thread or streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const threadChanged = prevThreadIdRef.current !== activeThreadId;
    prevThreadIdRef.current = activeThreadId;
    if (!threadChanged && !stickToBottomRef.current) return;

    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const raf = requestAnimationFrame(toBottom);
    const settle = window.setTimeout(toBottom, 60);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [activeThreadId, activeThread?.messages.length, streamTick, isStreaming, uiTheme]);

  // Auto-resize composer textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [inputPrompt, activeNav, activeThreadId, uiTheme]);

  const updateThread = (threadId: string, updater: (t: ChatThread) => ChatThread) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? updater(t) : t)));
  };

  const handleNewSession = () => {
    if (isStreaming) handleStopGeneration();
    const fresh = createEmptyThread(selectedModel.id, activeThread?.agent || 'build');
    setThreads((prev) => [fresh, ...prev]);
    setActiveThreadId(fresh.id);
    setActiveNav('workspace');
    setShowSessionsModal(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleClearCurrentSession = () => {
    if (!activeThread) return;
    if (isStreaming) handleStopGeneration();
    updateThread(activeThread.id, (t) => ({
      ...t,
      opencodeSessionID: undefined,
      title: 'New session',
      messages: [],
      updatedAt: Date.now()
    }));
  };

  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = threads.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      const fresh = createEmptyThread(selectedModel.id, 'build');
      setThreads([fresh]);
      setActiveThreadId(fresh.id);
      return;
    }
    setThreads(remaining);
    if (activeThreadId === id) setActiveThreadId(remaining[0].id);
  };

  const handleModelChange = (newModelId: string) => {
    if (!activeThread) return;
    updateThread(activeThread.id, (t) => ({
      ...t,
      modelId: newModelId,
      updatedAt: Date.now()
    }));
    setShowModelModal(false);
  };

  const handleAgentToggle = () => {
    if (!activeThread) return;
    const nextAgent = activeThread.agent === 'build' ? 'plan' : 'build';
    updateThread(activeThread.id, (t) => ({
      ...t,
      agent: nextAgent,
      updatedAt: Date.now()
    }));
  };

  const executeSlashCommand = (rawCmd: string) => {
    const parts = rawCmd.trim().toLowerCase().split(/\s+/);
    const cmd = parts[0];
    const arg = parts[1];
    setInputPrompt('');

    if (cmd === '/themes' || cmd === '/theme') {
      if (arg) {
        if (arg === 'ios' || arg === 'imessage' || arg === 'ios-light' || arg === 'light') {
          setUiTheme('ios-light');
          return;
        }
        if (arg === 'ios-dark' || arg === 'dark') {
          setUiTheme('ios-dark');
          return;
        }
        if (arg === 'ios-auto' || arg === 'auto') {
          setUiTheme('ios-auto');
          return;
        }
        if (arg === 'default' || arg === 'opencode' || arg === 'terminal' || arg === 'tui') {
          setUiTheme('opencode');
          return;
        }
        const matchedTheme = THEME_OPTIONS.find((t) => t.id === arg);
        if (matchedTheme) {
          setUiTheme(matchedTheme.id);
          return;
        }
      }
      setShowThemeModal(true);
      return;
    }

    switch (cmd) {
      case '/commands':
      case '/help':
        setShowCommandModal(true);
        break;
      case '/models':
      case '/model':
        setShowModelModal(true);
        break;
      case '/new':
        handleNewSession();
        break;
      case '/agent':
      case '/agents':
        handleAgentToggle();
        break;
      case '/sessions':
        if (isIosTheme) setActiveNav('sessions');
        else setShowSessionsModal(true);
        break;
      case '/files':
        if (isIosTheme) setActiveNav('files');
        else {
          fetchWorkspaceFiles();
          setShowFilesModal(true);
        }
        break;
      case '/sidebar':
        setShowTuiSidebar((prev) => !prev);
        break;
      case '/vercel':
      case '/github':
      case '/deploy':
        setShowDeployModal(true);
        break;
      case '/clear':
        handleClearCurrentSession();
        break;
      default:
        break;
    }
  };

  const handleStopGeneration = async () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    if (activeThread?.opencodeSessionID) {
      fetch(buildApiUrl('/api/chat/interrupt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: activeThread.opencodeSessionID })
      }).catch(() => {});
    }
  };

  const handleSendMessage = async (
    overrideText?: string,
    overrideAgent?: 'build' | 'plan',
    resetSession = false
  ) => {
    const text = (overrideText ?? inputPrompt).trim();
    if (!text || isStreaming || !activeThread) return;

    if (text.startsWith('/') && !overrideText) {
      const firstWord = text.split(/\s+/)[0].toLowerCase();
      const isKnownSlash =
        SLASH_COMMANDS.some((c) => c.cmd === firstWord) ||
        ['/theme', '/model', '/github', '/deploy'].includes(firstWord);
      if (isKnownSlash) {
        executeSlashCommand(text);
        return;
      }
    }

    const currentThreadId = activeThread.id;
    const currentModel = selectedModel;
    const currentAgent = overrideAgent ?? activeThread.agent;
    const sessionIdToUse = resetSession ? undefined : activeThread.opencodeSessionID;

    if (!overrideText) setInputPrompt('');
    setActiveNav('workspace');
    stickToBottomRef.current = true;

    const startTime = Date.now();
    const userMsg: ChatMessage = {
      id: 'usr_' + startTime,
      role: 'user',
      content: text,
      model: currentModel.fullId,
      agent: currentAgent,
      timestamp: startTime
    };

    const assistantMsgId = 'ast_' + (startTime + 1);
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      model: currentModel.fullId,
      agent: currentAgent,
      timestamp: startTime + 1,
      tools: [],
      segments: []
    };

    setExpandedReasoning((prev) => ({ ...prev, [assistantMsgId]: true }));

    updateThread(currentThreadId, (t) => ({
      ...t,
      opencodeSessionID: resetSession ? undefined : t.opencodeSessionID,
      agent: currentAgent,
      title: t.messages.length === 0 ? text.slice(0, 48) : t.title,
      updatedAt: Date.now(),
      messages: [...t.messages, userMsg, assistantPlaceholder]
    }));

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let response: Response | null = null;
      let lastFetchErr: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(buildApiUrl('/api/chat/stream'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              modelId: currentModel.id,
              sessionID: attempt === 0 ? sessionIdToUse : undefined,
              agent: currentAgent
            }),
            signal: controller.signal
          });
          if (res.ok && res.body) {
            response = res;
            break;
          }
          // Retry on 502/503/504 warmup responses
          if ([502, 503, 504].includes(res.status) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 700));
            continue;
          }
          response = res;
          break;
        } catch (fetchErr: any) {
          if (fetchErr?.name === 'AbortError') throw fetchErr;
          lastFetchErr = fetchErr;
          // If custom apiBaseUrl failed, fall back to same-origin '/api/chat/stream'
          if (apiBaseUrl) {
            setApiBaseUrl('');
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 700));
          }
        }
      }

      if (!response) {
        throw lastFetchErr || new Error('Unable to reach OpenCode runtime');
      }

      if (!response.ok || !response.body) {
        const errText = await response.text();
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const ev = JSON.parse(jsonStr);

            if (ev.type === 'session_init' && ev.sessionID) {
              updateThread(currentThreadId, (t) => ({
                ...t,
                opencodeSessionID: ev.sessionID
              }));
            } else if (ev.type === 'session_title' && ev.title) {
              updateThread(currentThreadId, (t) => ({
                ...t,
                title: ev.title
              }));
            } else if (ev.type === 'reasoning_delta' && typeof ev.delta === 'string') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, reasoning: (m.reasoning || '') + ev.delta }
                    : m
                )
              }));
            } else if (ev.type === 'reasoning_done' && typeof ev.text === 'string') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId && !m.reasoning ? { ...m, reasoning: ev.text } : m
                )
              }));
            } else if (ev.type === 'text_delta' && typeof ev.delta === 'string') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId ? appendTextSegment(m, ev.delta) : m
                )
              }));
            } else if (ev.type === 'text_done' && typeof ev.text === 'string') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) => {
                  if (m.id !== assistantMsgId || m.content) return m;
                  return {
                    ...m,
                    content: ev.text,
                    segments: [
                      ...(m.segments || []),
                      { id: newSegmentId(), kind: 'text', text: ev.text }
                    ]
                  };
                })
              }));
            } else if (ev.type === 'tool_start') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        tools: [
                          ...(m.tools || []),
                          { id: ev.id, name: ev.name || 'tool', status: 'running' }
                        ],
                        segments: [
                          ...(m.segments || []),
                          {
                            id: newSegmentId(),
                            kind: 'tool' as const,
                            tool: {
                              id: ev.id,
                              name: ev.name || 'tool',
                              status: 'running' as const
                            }
                          }
                        ]
                      }
                    : m
                )
              }));
            } else if (ev.type === 'tool_call') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId ? patchTool(m, ev.id, { input: ev.input }) : m
                )
              }));
            } else if (ev.type === 'tool_result') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? patchTool(m, ev.id, { status: 'done', title: ev.title })
                    : m
                )
              }));
            } else if (ev.type === 'tool_error') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? patchTool(m, ev.id, {
                        status: 'error',
                        error: String(ev.error || 'Tool error')
                      })
                    : m
                )
              }));
            } else if (ev.type === 'usage' && ev.tokens) {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        tokens: {
                          input: ev.tokens.input || 0,
                          output: ev.tokens.output || 0,
                          reasoning: ev.tokens.reasoning || 0,
                          cacheRead: ev.tokens.cache?.read || 0
                        }
                      }
                    : m
                )
              }));
            } else if (ev.type === 'error') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, error: ev.message || 'OpenCode inference error' }
                    : m
                )
              }));
            } else if (ev.type === 'done') {
              const elapsed = Date.now() - startTime;
              updateThread(currentThreadId, (t) => ({
                ...t,
                updatedAt: Date.now(),
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, durationMs: elapsed } : m
                )
              }));
              setExpandedReasoning((prev) => ({ ...prev, [assistantMsgId]: false }));
            }
          } catch {
            // ignore partial JSON parse error
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        updateThread(currentThreadId, (t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, error: err?.message || 'Connection interrupted' }
              : m
          )
        }));
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleRetryMessage = (failedAssistantMsgId: string) => {
    if (!activeThread || isStreaming) return;
    const msgs = activeThread.messages;
    const errIdx = msgs.findIndex((m) => m.id === failedAssistantMsgId);
    let promptText = '';
    let promptAgent: 'build' | 'plan' = activeThread.agent;
    let userMsgIdToRemove: string | null = null;

    if (errIdx > 0 && msgs[errIdx - 1]?.role === 'user') {
      promptText = msgs[errIdx - 1].content;
      promptAgent = msgs[errIdx - 1].agent;
      userMsgIdToRemove = msgs[errIdx - 1].id;
    } else {
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        promptText = lastUser.content;
        promptAgent = lastUser.agent;
        userMsgIdToRemove = lastUser.id;
      }
    }

    if (!promptText) return;

    updateThread(activeThread.id, (t) => ({
      ...t,
      opencodeSessionID: undefined,
      messages: t.messages.filter(
        (m) => m.id !== failedAssistantMsgId && m.id !== userMsgIdToRemove
      )
    }));

    setTimeout(() => {
      handleSendMessage(promptText, promptAgent, true);
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      handleAgentToggle();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const totalSessionTokens = activeThread.messages.reduce(
    (acc, m) => acc + (m.tokens ? m.tokens.input + m.tokens.output : 0),
    0
  );

  const isBuildAgent = activeThread.agent === 'build';

  /* ========================================================================
     SHARED MODALS (Official OpenCode v2.2.1 TUI Dialogs + iOS Sheet Support)
     ======================================================================== */
  const renderSharedModals = () => (
    <>
      {/* ================= Official OpenCode TUI Commands Dialog (ctrl+p) ================= */}
      {showCommandModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh] px-4"
          onClick={() => setShowCommandModal(false)}
        >
          <div
            className="w-full max-w-[540px] bg-[var(--oc-panel)] font-mono text-[var(--oc-fg)] shadow-2xl border border-[color:var(--oc-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (`function Da` from binary) */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="font-bold text-[13.5px] text-[var(--oc-fg)]">Commands</span>
              <button
                type="button"
                onClick={() => setShowCommandModal(false)}
                className="text-[12px] text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
              >
                esc
              </button>
            </div>

            {/* Filter input (`function qr` from binary) */}
            <div className="px-4 pb-2.5">
              <input
                type="text"
                autoFocus
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-[13px] text-[var(--oc-fg)] placeholder-[var(--oc-fg-dim)] focus:outline-none"
              />
            </div>

            {/* Options list (`function Bz` from binary) */}
            <div className="max-h-[55vh] overflow-y-auto pb-2">
              {SLASH_COMMANDS.filter(
                (c) =>
                  c.title.toLowerCase().includes(commandSearch.toLowerCase()) ||
                  c.cmd.toLowerCase().includes(commandSearch.toLowerCase()) ||
                  c.category.toLowerCase().includes(commandSearch.toLowerCase()) ||
                  c.desc.toLowerCase().includes(commandSearch.toLowerCase())
              ).map((c) => (
                <button
                  key={c.cmd}
                  type="button"
                  onClick={() => {
                    setShowCommandModal(false);
                    setCommandSearch('');
                    executeSlashCommand(c.cmd);
                  }}
                  className="group flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--oc-elevated)]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="w-1 text-transparent group-hover:text-[var(--oc-build)]">
                      ┃
                    </span>
                    <span className="font-medium text-[var(--oc-fg)] group-hover:text-[var(--oc-build)]">
                      {c.title}
                    </span>
                    <span className="truncate text-[12px] text-[var(--oc-fg-muted)]">
                      {c.cmd}
                    </span>
                  </div>
                  <span className="ml-4 shrink-0 text-[12px] text-[var(--oc-fg-muted)]">
                    {c.keybind}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= Themes Modal (/themes · function lo) ================= */}
      {showThemeModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] px-4"
          onClick={() => setShowThemeModal(false)}
        >
          <div
            className={`max-h-[80vh] w-full max-w-[540px] overflow-hidden shadow-2xl ${
              isIosTheme
                ? 'rounded-[20px] bg-[var(--im-surface)] text-[var(--im-label)] ring-1 ring-[color:var(--im-sep)]'
                : 'border border-[color:var(--oc-border)] bg-[var(--oc-panel)] text-[var(--oc-fg)] font-mono'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Official TUI Dialog Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="font-bold text-[13.5px]">Themes</span>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className={`text-[12px] ${
                  isIosTheme
                    ? 'text-[var(--im-label-2)] hover:text-[var(--im-label)]'
                    : 'text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]'
                }`}
              >
                esc
              </button>
            </div>

            <div className="px-4 pb-2.5">
              <input
                type="text"
                autoFocus
                value={themeSearch}
                onChange={(e) => setThemeSearch(e.target.value)}
                placeholder="Search"
                className={`w-full bg-transparent text-[13px] focus:outline-none ${
                  isIosTheme
                    ? 'rounded-[8px] bg-[var(--im-fill)] px-2.5 py-1.5 text-[var(--im-label)] placeholder-[var(--im-label-2)]'
                    : 'text-[var(--oc-fg)] placeholder-[var(--oc-fg-dim)]'
                }`}
              />
            </div>

            <div className="max-h-[58vh] overflow-y-auto pb-2">
              {THEME_OPTIONS.filter(
                (t) =>
                  t.name.toLowerCase().includes(themeSearch.toLowerCase()) ||
                  t.id.toLowerCase().includes(themeSearch.toLowerCase()) ||
                  t.category.toLowerCase().includes(themeSearch.toLowerCase())
              ).map((t) => {
                const active = t.id === uiTheme;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setUiTheme(t.id);
                      setShowThemeModal(false);
                    }}
                    className={`group flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors ${
                      isIosTheme
                        ? 'hover:bg-[var(--im-hover)]'
                        : active
                          ? 'bg-[var(--oc-elevated)]'
                          : 'hover:bg-[var(--oc-elevated)]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`w-1 ${
                          active
                            ? 'text-[var(--oc-build)]'
                            : 'text-transparent group-hover:text-[var(--oc-build)]'
                        }`}
                      >
                        ┃
                      </span>
                      <span className="w-3 text-[11px] text-[var(--oc-build)]">
                        {active ? '●' : ''}
                      </span>
                      <div className="flex shrink-0 items-center -space-x-1">
                        {t.swatches.map((hex, idx) => (
                          <span
                            key={idx}
                            className="h-3 w-3 rounded-full ring-1 ring-white/25"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                      <span className="truncate font-medium">{t.name}</span>
                      <span
                        className={`truncate text-[11.5px] ${
                          isIosTheme ? 'text-[var(--im-label-2)]' : 'text-[var(--oc-fg-muted)]'
                        }`}
                      >
                        {t.category}
                      </span>
                    </div>
                    <span
                      className={`ml-3 shrink-0 text-[11.5px] ${
                        t.badge === 'ios'
                          ? 'text-[#0b84ff]'
                          : active
                            ? 'text-[var(--oc-green)]'
                            : 'text-[var(--oc-fg-muted)]'
                      }`}
                    >
                      {t.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= Select Model Modal (/models · function gn) ================= */}
      {showModelModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] px-4"
          onClick={() => setShowModelModal(false)}
        >
          <div
            className={`max-h-[80vh] w-full max-w-[540px] overflow-hidden shadow-2xl ${
              isIosTheme
                ? 'rounded-[20px] bg-[var(--im-surface)] text-[var(--im-label)] ring-1 ring-[color:var(--im-sep)]'
                : 'border border-[color:var(--oc-border)] bg-[var(--oc-panel)] text-[var(--oc-fg)] font-mono'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="font-bold text-[13.5px]">Select model</span>
              <button
                type="button"
                onClick={() => setShowModelModal(false)}
                className={`text-[12px] ${
                  isIosTheme
                    ? 'text-[var(--im-label-2)] hover:text-[var(--im-label)]'
                    : 'text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]'
                }`}
              >
                esc
              </button>
            </div>

            <div className="px-4 pb-2.5">
              <input
                type="text"
                autoFocus
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models"
                className={`w-full bg-transparent text-[13px] focus:outline-none ${
                  isIosTheme
                    ? 'rounded-[8px] bg-[var(--im-fill)] px-2.5 py-1.5 text-[var(--im-label)] placeholder-[var(--im-label-2)]'
                    : 'text-[var(--oc-fg)] placeholder-[var(--oc-fg-dim)]'
                }`}
              />
            </div>

            <div className="px-4 pb-1 text-[11.5px] font-bold text-[var(--oc-build)]">
              OpenCode Zen
            </div>

            <div className="max-h-[58vh] overflow-y-auto pb-2">
              {models
                .filter(
                  (m) =>
                    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                    m.id.toLowerCase().includes(modelSearch.toLowerCase())
                )
                .map((m) => {
                  const current = m.id === selectedModel.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelChange(m.id)}
                      className={`group flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors ${
                        isIosTheme
                          ? 'hover:bg-[var(--im-hover)]'
                          : current
                            ? 'bg-[var(--oc-elevated)]'
                            : 'hover:bg-[var(--oc-elevated)]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`w-1 ${
                            current
                              ? 'text-[var(--oc-build)]'
                              : 'text-transparent group-hover:text-[var(--oc-build)]'
                          }`}
                        >
                          ┃
                        </span>
                        <span className="w-3 text-[11px] text-[var(--oc-build)]">
                          {current ? '●' : ''}
                        </span>
                        <span className="truncate font-medium">{m.name}</span>
                        <span
                          className={`truncate text-[11.5px] ${
                            isIosTheme ? 'text-[var(--im-label-2)]' : 'text-[var(--oc-fg-muted)]'
                          }`}
                        >
                          OpenCode Zen · {Math.round(m.contextLimit / 1000)}K
                        </span>
                      </div>
                      <span className="ml-3 shrink-0 text-[11.5px] text-[var(--oc-green)]">
                        Free
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ================= Official TUI Sessions Dialog (/sessions) ================= */}
      {showSessionsModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] px-4"
          onClick={() => setShowSessionsModal(false)}
        >
          <div
            className="w-full max-w-[540px] border border-[color:var(--oc-border)] bg-[var(--oc-panel)] font-mono text-[var(--oc-fg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="font-bold text-[13.5px]">Switch session</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleNewSession}
                  className="text-[12px] text-[var(--oc-build)] hover:underline"
                >
                  + new
                </button>
                <button
                  type="button"
                  onClick={() => setShowSessionsModal(false)}
                  className="text-[12px] text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
                >
                  esc
                </button>
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto pb-2">
              {threads.map((t) => {
                const active = t.id === activeThreadId;
                return (
                  <div
                    key={t.id}
                    className={`group flex items-center justify-between px-3 py-1.5 text-[13px] ${
                      active ? 'bg-[var(--oc-elevated)]' : 'hover:bg-[var(--oc-elevated)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadId(t.id);
                        setShowSessionsModal(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={`w-1 ${
                          active
                            ? 'text-[var(--oc-build)]'
                            : 'text-transparent group-hover:text-[var(--oc-build)]'
                        }`}
                      >
                        ┃
                      </span>
                      <span className="w-3 text-[11px] text-[var(--oc-build)]">
                        {active ? '●' : ''}
                      </span>
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="shrink-0 text-[11.5px] text-[var(--oc-fg-muted)]">
                        {t.messages.length} msgs · {fmtTime(t.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteThread(t.id, e)}
                      className="ml-2 text-[11.5px] text-[var(--oc-fg-dim)] hover:text-[var(--oc-danger)]"
                    >
                      del
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= Official TUI Workspace Files Dialog (/files) ================= */}
      {showFilesModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] px-4"
          onClick={() => setShowFilesModal(false)}
        >
          <div
            className="w-full max-w-[680px] border border-[color:var(--oc-border)] bg-[var(--oc-panel)] font-mono text-[var(--oc-fg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[color:var(--oc-border)]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[13.5px]">Workspace files</span>
                <span className="text-[11.5px] text-[var(--oc-fg-muted)]">
                  /tmp/opencode-workspace
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fetchWorkspaceFiles(selectedFilePath)}
                  className="text-[12px] text-[var(--oc-build)] hover:underline"
                >
                  refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilesModal(false)}
                  className="text-[12px] text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
                >
                  esc
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[color:var(--oc-border)] max-h-[65vh]">
              <div className="overflow-y-auto py-1">
                {workspaceFiles.map((f) => {
                  const active = selectedFilePath === f.path;
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => fetchWorkspaceFiles(f.path)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] ${
                        active
                          ? 'bg-[var(--oc-elevated)] text-[var(--oc-build)] font-bold'
                          : 'hover:bg-[var(--oc-elevated)]'
                      }`}
                    >
                      <span className="truncate">{f.path}</span>
                      <span className="text-[11px] text-[var(--oc-fg-muted)]">{f.size}B</span>
                    </button>
                  );
                })}
              </div>
              <div className="sm:col-span-2 flex flex-col overflow-hidden bg-[var(--oc-bg)]">
                <div className="flex items-center justify-between border-b border-[color:var(--oc-border)] px-3 py-1.5 text-[11.5px] text-[var(--oc-fg-muted)]">
                  <span>{selectedFilePath}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedFileContent);
                      setCopiedFile(true);
                      setTimeout(() => setCopiedFile(false), 1600);
                    }}
                    className="hover:text-[var(--oc-fg)]"
                  >
                    {copiedFile ? 'copied' : 'copy'}
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-3 text-[12px] leading-relaxed">
                  <code>{selectedFileContent || '// Empty file'}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= Vercel & GitHub Pages Deploy Modal (/vercel) ================= */}
      {showDeployModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] px-4"
          onClick={() => setShowDeployModal(false)}
        >
          <div
            className={`max-h-[82vh] w-full max-w-xl overflow-hidden shadow-2xl ${
              isIosTheme
                ? 'rounded-[20px] bg-[var(--im-surface)] text-[var(--im-label)] ring-1 ring-[color:var(--im-sep)]'
                : 'border border-[color:var(--oc-border)] bg-[var(--oc-panel)] text-[var(--oc-fg)] font-mono'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--oc-border)] px-4 py-3">
              <div>
                <div className="text-[13.5px] font-bold">
                  Deploy to Vercel & GitHub Pages
                </div>
                <div className="text-[11px] text-[var(--oc-fg-muted)]">
                  opaslabs / opencode · vercel.json & gateway proxy configured
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="text-[12px] text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
              >
                esc
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4 text-[12.5px]">
              {/* Vercel box */}
              <div
                className={`p-3.5 ${
                  isIosTheme
                    ? 'rounded-[14px] bg-[var(--im-fill)]'
                    : 'border border-[color:var(--oc-border)] bg-[var(--oc-bg)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">1. Deploy on Vercel (Recommended)</span>
                  <span className="text-[11px] font-medium text-[var(--oc-green)]">
                    vercel.json ready
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-[var(--oc-fg-muted)]">
                  <code className="px-1 font-mono">vercel.json</code> is pre-configured in the project
                  root. Import this repository into Vercel or run{' '}
                  <code className="px-1 font-mono">npx vercel --prod</code> — Vercel automatically
                  rewrites <code className="px-1 font-mono">/api/*</code> to the live OpenCode Zen
                  gateway.
                </p>
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[11px] opacity-75">vercel.json</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(VERCEL_JSON_CONFIG);
                        setCopiedVercelJson(true);
                        setTimeout(() => setCopiedVercelJson(false), 1600);
                      }}
                      className="flex items-center gap-1 text-[11px] text-[var(--oc-build)] hover:opacity-80"
                    >
                      {copiedVercelJson ? 'copied' : 'copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto bg-[#0a0a0a] p-2.5 text-[11px] text-white/80">
                    <code>{VERCEL_JSON_CONFIG}</code>
                  </pre>
                </div>
              </div>

              {/* Remote Gateway Configuration */}
              <div
                className={`p-3.5 ${
                  isIosTheme
                    ? 'rounded-[14px] bg-[var(--im-fill)]'
                    : 'border border-[color:var(--oc-border)] bg-[var(--oc-bg)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">2. OpenCode Zen Gateway URL</span>
                  <span className="text-[11px] opacity-70">CORS enabled</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={gatewayInput}
                    onChange={(e) => setGatewayInput(e.target.value)}
                    placeholder={DEFAULT_CLOUD_GATEWAY}
                    className="min-w-0 flex-1 border border-[color:var(--oc-border)] bg-[var(--oc-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--oc-fg)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cleaned = gatewayInput.trim().replace(/\/+$/, '');
                      setApiBaseUrl(cleaned);
                      try {
                        localStorage.setItem(GATEWAY_STORAGE_KEY, cleaned);
                      } catch {
                        // ignore
                      }
                      setShowDeployModal(false);
                    }}
                    className="shrink-0 bg-[var(--oc-build)] px-3 py-1.5 text-[12px] font-semibold text-black"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGatewayInput(DEFAULT_CLOUD_GATEWAY);
                      setApiBaseUrl('');
                      try {
                        localStorage.removeItem(GATEWAY_STORAGE_KEY);
                      } catch {
                        // ignore
                      }
                    }}
                    className="shrink-0 border border-[color:var(--oc-border)] bg-[var(--oc-panel)] px-3 py-1.5 text-[12px] text-[var(--oc-fg-muted)]"
                  >
                    Auto
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  /* ========================================================================
     BRANCH A: BUG-FIXED iOS (iMessage / Apple Messages) THEME
     ======================================================================== */
  if (isIosTheme) {
    const renderIosComposer = (centered = false) => (
      <div
        className={`w-full ${centered ? 'max-w-[600px] mx-auto' : 'max-w-2xl mx-auto'} relative`}
      >
        {/* Slash command popover */}
        {showSlashMenu && matchingSlashCommands.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-[16px] border border-[color:var(--im-sep)] bg-[var(--im-surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
            <div className="divide-y divide-[color:var(--im-sep)]">
              {matchingSlashCommands.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => executeSlashCommand(item.cmd)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-[var(--im-hover)]"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[#0b84ff]">{item.cmd}</span>
                    <span className="ml-2.5 truncate text-[var(--im-label-2)]">{item.desc}</span>
                  </div>
                  <span className="ml-4 shrink-0 rounded-md bg-[var(--im-inline-code)] px-1.5 py-0.5 text-[11px] text-[var(--im-label-2)]">
                    {item.keybind}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pill input */}
        <div className="im-composer-shell flex items-end gap-1.5 rounded-[24px] py-1.5 pl-1.5 pr-1.5">
          <button
            type="button"
            onClick={() => setShowModelModal(true)}
            title="Choose a Zen model"
            aria-label="Choose a model"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--im-fill)] text-[var(--im-label-2)] transition-colors hover:bg-[var(--im-fill-strong)] hover:text-[var(--im-label)]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`iMessage · "${OPENCODE_PLACEHOLDERS[placeholderIdx]}" (or /themes)`}
            className="max-h-36 flex-1 resize-none bg-transparent px-1 py-[5px] text-[15.5px] leading-snug text-[var(--im-label)] placeholder-[var(--im-label-3)] focus:outline-none"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              title="Stop generating (esc)"
              aria-label="Stop generating"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b84ff] text-white transition-transform active:scale-95"
            >
              <Square className="h-3 w-3 fill-current" strokeWidth={0} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputPrompt.trim()}
              aria-label="Send message"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 ${
                inputPrompt.trim()
                  ? 'bg-[#0b84ff] text-white shadow-sm hover:bg-[#0071e3]'
                  : 'bg-[var(--im-fill-strong)] text-[var(--im-label-3)]'
              }`}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.75} />
            </button>
          )}
        </div>

        {/* Status line under composer */}
        <div className="mt-1.5 flex items-center justify-between gap-2 px-2 text-[12px] text-[var(--im-label-2)]">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleAgentToggle}
              title="Switch agent (Tab)"
              className="shrink-0 font-semibold transition-opacity hover:opacity-70"
              style={{ color: agentTint(activeThread.agent) }}
            >
              {isBuildAgent ? 'Build' : 'Plan'}
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowModelModal(true)}
              className="truncate transition-opacity hover:opacity-70"
              title="Select model (Ctrl+M)"
            >
              {selectedModel.name}
            </button>
            <span className="hidden shrink-0 sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden shrink-0 text-[var(--im-green-text)] sm:inline">Free</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11.5px]">
            <button
              type="button"
              onClick={() => setShowThemeModal(true)}
              className="font-medium text-[#0b84ff] hover:opacity-75"
            >
              /themes
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setUiTheme('opencode')}
              className="text-[var(--im-label-2)] hover:text-[var(--im-label)]"
            >
              Terminal UI
            </button>
          </div>
        </div>
      </div>
    );

    const iosNavItems = [
      { id: 'workspace' as const, label: 'Chat' },
      { id: 'models' as const, label: `Models (${models.length})` },
      { id: 'files' as const, label: 'Files' },
      { id: 'sessions' as const, label: `Sessions (${threads.length})` }
    ];

    return (
      <div
        data-theme={iosAppearance}
        className="im-app flex h-dvh flex-col overflow-hidden bg-[var(--im-bg)] text-[var(--im-label)] antialiased"
      >
        {/* Contact header + segmented nav */}
        <header className="shrink-0 border-b border-[color:var(--im-sep)] im-glass z-30">
          <div className="mx-auto flex h-[52px] max-w-2xl items-center justify-between gap-3 px-3">
            <button
              type="button"
              onClick={() => setActiveNav('workspace')}
              className="flex min-w-0 items-center gap-2.5 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#1c1c1e] shadow-sm ring-1 ring-[color:var(--im-sep)]">
                <MarkGlyph className="h-3 w-auto" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">
                  opaslabs / opencode
                </span>
                <span className="block truncate text-[11px] text-[var(--im-label-2)]">
                  iOS Theme · Free Zen
                </span>
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowThemeModal(true)}
                className="rounded-full bg-[var(--im-fill)] px-2.5 py-1 text-[12px] font-medium text-[var(--im-label)] transition-colors hover:bg-[var(--im-fill-strong)]"
              >
                Themes
              </button>
              <button
                type="button"
                onClick={handleNewSession}
                aria-label="New session"
                title="New session (Ctrl+N)"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b84ff] transition-colors hover:bg-[#0b84ff]/10"
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </div>

          <nav className="mx-auto max-w-2xl px-3 pb-2">
            <div className="flex rounded-[9px] bg-[var(--im-fill)] p-[2px]">
              {iosNavItems.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`flex-1 rounded-[7px] px-1 py-[5px] text-[12px] transition-all ${
                      active
                        ? 'bg-[var(--im-surface)] font-semibold text-[var(--im-label)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                        : 'text-[var(--im-label-2)] hover:text-[var(--im-label)]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeNav === 'workspace' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {activeThread.messages.length === 0 ? (
                <div className="im-scroll flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
                  <div className="w-full max-w-[600px] space-y-6">
                    <div className="space-y-3 text-center">
                      <div className="inline-flex items-center justify-center rounded-[20px] bg-[#141414] px-5 py-3 ring-1 ring-black/10 shadow-md">
                        <OpenCodeWordmark className="h-5 w-auto" />
                      </div>
                      <div>
                        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--im-label)]">
                          opaslabs <span className="text-[var(--im-label-3)]">/</span> opencode
                        </h1>
                        <p className="mt-0.5 text-[13px] text-[var(--im-label-2)]">
                          iOS Messages Theme · Free Zen models · No login required
                        </p>
                      </div>
                    </div>

                    {renderIosComposer(true)}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1 text-[11px] text-[var(--im-label-2)]">
                        <span>Suggestions</span>
                        <button
                          type="button"
                          onClick={() => setUiTheme('opencode')}
                          className="text-[#0b84ff] transition-opacity hover:opacity-70"
                        >
                          Switch to Default Terminal UI →
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {STARTER_PROMPTS.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendMessage(item.prompt, item.agent)}
                            className="rounded-[16px] bg-[var(--im-fill)] px-3.5 py-2.5 text-left transition-all hover:bg-[var(--im-fill-strong)] active:scale-[0.99]"
                          >
                            <div className="truncate text-[13px] font-medium text-[var(--im-label)]">
                              {item.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--im-label-2)]">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: agentTint(item.agent) }}
                              />
                              <span>{item.agent === 'build' ? 'Build' : 'Plan'}</span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{selectedModel.id}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="shrink-0 border-b border-[color:var(--im-sep)] bg-[var(--im-bar)] px-4 py-1.5">
                    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 text-[12px] text-[var(--im-label-2)]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-semibold text-[var(--im-label)]">
                          {activeThread.title}
                        </span>
                        {activeThread.opencodeSessionID && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0 font-mono text-[11px]">
                              {activeThread.opencodeSessionID.slice(0, 12)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 tabular-nums">
                        <span>{totalSessionTokens.toLocaleString()} tok</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--im-green-text)]">$0.00</span>
                        <button
                          type="button"
                          onClick={handleClearCurrentSession}
                          className="text-[#0b84ff] transition-opacity hover:opacity-70"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    ref={scrollRef}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      stickToBottomRef.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 96;
                    }}
                    className="im-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
                  >
                    <div className="mx-auto max-w-2xl pb-2">
                      <div className="pb-2 text-center text-[11px] text-[var(--im-label-2)]">
                        {new Date(
                          activeThread.messages[0]?.timestamp || Date.now()
                        ).toLocaleDateString([], {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                        {' · '}
                        {fmtTime(activeThread.messages[0]?.timestamp || Date.now())}
                      </div>

                      {activeThread.messages.map((msg, idx) => {
                        const hasReasoning = Boolean(
                          msg.reasoning && msg.reasoning.trim().length > 0
                        );
                        const isReasoningOpen = Boolean(expandedReasoning[msg.id]);
                        const tint = agentTint(msg.agent);
                        const GROUP_WINDOW = 5 * 60 * 1000;
                        const sameKind = (a?: ChatMessage, b?: ChatMessage) =>
                          Boolean(a && b && a.role === b.role && a.agent === b.agent);
                        const prev = activeThread.messages[idx - 1];
                        const next = activeThread.messages[idx + 1];
                        const inGroup = Boolean(
                          prev &&
                            sameKind(prev, msg) &&
                            msg.timestamp - prev.timestamp < GROUP_WINDOW
                        );
                        const endsGroup = !(
                          next &&
                          sameKind(msg, next) &&
                          next.timestamp - msg.timestamp < GROUP_WINDOW
                        );

                        const outShape = `${
                          inGroup ? 'rounded-[20px] rounded-tr-[6px]' : 'rounded-[20px]'
                        } ${endsGroup ? 'rounded-br-[5px]' : 'rounded-br-[20px]'}`;
                        const inShape = `${
                          inGroup ? 'rounded-[20px] rounded-tl-[6px]' : 'rounded-[20px]'
                        } ${endsGroup ? 'rounded-bl-[5px]' : 'rounded-bl-[20px]'}`;

                        const renderToolChip = (tool: ToolEventItem) => (
                          <div
                            key={tool.id}
                            className="mt-1 flex max-w-[85%] items-center gap-2 rounded-full bg-[var(--im-fill)] px-3 py-1.5 text-[12px] ring-1 ring-[color:var(--im-sep)]"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                background:
                                  tool.status === 'error'
                                    ? APPLE_RED
                                    : tool.status === 'done'
                                      ? APPLE_GREEN
                                      : APPLE_BLUE
                              }}
                            />
                            <span className="shrink-0 font-mono font-semibold text-[var(--im-label)]">
                              {tool.name}
                            </span>
                            <span className="truncate text-[var(--im-label-2)]">
                              {tool.title
                                ? tool.title
                                : tool.input
                                  ? JSON.stringify(tool.input).slice(0, 64)
                                  : 'running…'}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] text-[var(--im-label-2)]">
                              {tool.status === 'running'
                                ? '…'
                                : tool.status === 'error'
                                  ? 'failed'
                                  : 'done'}
                            </span>
                          </div>
                        );

                        if (msg.role === 'user') {
                          return (
                            <div
                              key={msg.id}
                              className={`im-rise flex flex-col items-end ${
                                inGroup ? 'mt-[3px]' : 'mt-3.5'
                              }`}
                            >
                              <div
                                className={`im-bubble im-bubble-out max-w-[82%] sm:max-w-[75%] whitespace-pre-wrap px-3.5 py-2 text-[15.5px] leading-[1.38] ${outShape}`}
                              >
                                {msg.content}
                                {endsGroup && (
                                  <svg
                                    className="im-tail im-tail-out"
                                    viewBox="0 0 11 16"
                                    aria-hidden="true"
                                    focusable="false"
                                  >
                                    <path d={TAIL_PATH} />
                                  </svg>
                                )}
                              </div>
                              {endsGroup && (
                                <div className="mt-1 flex items-center gap-1.5 pr-1 text-[11px] text-[var(--im-label-2)]">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: tint }}
                                  />
                                  <span>{msg.agent === 'build' ? 'Build' : 'Plan'}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">{fmtTime(msg.timestamp)}</span>
                                </div>
                              )}
                            </div>
                          );
                        }

                        const validSegments = (msg.segments || []).filter(
                          (s) => s.kind === 'tool' || s.text.trim().length > 0
                        );
                        const hasAnyText =
                          validSegments.some((s) => s.kind === 'text') ||
                          msg.content.trim().length > 0;
                        const isLastAssistantMessage = idx === activeThread.messages.length - 1;
                        const showTypingDots =
                          !msg.error &&
                          !hasAnyText &&
                          (isStreaming && isLastAssistantMessage);

                        // Find index of last text segment for tail placement
                        let lastTextSegIndex = -1;
                        validSegments.forEach((s, sIdx) => {
                          if (s.kind === 'text') lastTextSegIndex = sIdx;
                        });

                        return (
                          <div
                            key={msg.id}
                            className={`im-rise flex flex-col items-start ${
                              inGroup ? 'mt-[3px]' : 'mt-3.5'
                            }`}
                          >
                            {hasReasoning && (
                              <div className="mb-1 max-w-[85%]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedReasoning((prevOpen) => ({
                                      ...prevOpen,
                                      [msg.id]: !prevOpen[msg.id]
                                    }))
                                  }
                                  className="flex items-center gap-1 rounded-full bg-[var(--im-fill)] px-2.5 py-1 text-[11.5px] text-[var(--im-label-2)] transition-colors hover:text-[var(--im-label)]"
                                >
                                  {isReasoningOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                  <span>Thinking</span>
                                  <span className="tabular-nums">
                                    · {msg.reasoning?.length.toLocaleString()} chars
                                  </span>
                                </button>
                                {isReasoningOpen && (
                                  <div className="mt-1.5 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-[14px] bg-[var(--im-fill)] px-3.5 py-2.5 text-[12.5px] italic leading-relaxed text-[var(--im-label-2)] ring-1 ring-[color:var(--im-sep)]">
                                    {msg.reasoning}
                                  </div>
                                )}
                              </div>
                            )}

                            {validSegments.length > 0 ? (
                              validSegments.map((seg, si) => {
                                if (seg.kind === 'tool') return renderToolChip(seg.tool);
                                const isLastVisual = endsGroup && si === lastTextSegIndex;
                                return (
                                  <div
                                    key={seg.id}
                                    className={`im-bubble im-bubble-in mt-1 max-w-[86%] sm:max-w-[78%] px-3.5 py-2.5 ${inShape}`}
                                  >
                                    <MarkdownRenderer content={seg.text} variant="ios" />
                                    {isLastVisual && (
                                      <svg
                                        className="im-tail im-tail-in"
                                        viewBox="0 0 11 16"
                                        aria-hidden="true"
                                        focusable="false"
                                      >
                                        <path d={TAIL_PATH} />
                                      </svg>
                                    )}
                                  </div>
                                );
                              })
                            ) : msg.content.trim().length > 0 ? (
                              <div
                                className={`im-bubble im-bubble-in mt-1 max-w-[86%] sm:max-w-[78%] px-3.5 py-2.5 ${inShape}`}
                              >
                                <MarkdownRenderer content={msg.content} variant="ios" />
                                {endsGroup && (
                                  <svg
                                    className="im-tail im-tail-in"
                                    viewBox="0 0 11 16"
                                    aria-hidden="true"
                                    focusable="false"
                                  >
                                    <path d={TAIL_PATH} />
                                  </svg>
                                )}
                              </div>
                            ) : null}

                            {showTypingDots && (
                              <div
                                className={`im-bubble im-bubble-in mt-1 flex items-center gap-1.5 px-4 py-3 ${inShape}`}
                              >
                                {[0, 1, 2].map((i) => (
                                  <span
                                    key={i}
                                    className="im-dot h-[7px] w-[7px] rounded-full bg-[var(--im-label-2)]"
                                    style={{ animationDelay: `${i * 0.15}s` }}
                                  />
                                ))}
                                {endsGroup && (
                                  <svg
                                    className="im-tail im-tail-in"
                                    viewBox="0 0 11 16"
                                    aria-hidden="true"
                                    focusable="false"
                                  >
                                    <path d={TAIL_PATH} />
                                  </svg>
                                )}
                              </div>
                            )}

                            {validSegments.length === 0 &&
                              msg.tools &&
                              msg.tools.length > 0 && (
                                <div className="mt-1.5 w-full max-w-[85%] space-y-1">
                                  {msg.tools.map(renderToolChip)}
                                </div>
                              )}

                            {msg.error && (
                              <div className="mt-1.5 max-w-[85%] rounded-[16px] bg-[#ff3b30]/12 px-3.5 py-2.5 text-[13px] text-[var(--im-danger-text)] ring-1 ring-[#ff3b30]/25">
                                <div className="font-medium">{msg.error}</div>
                                <button
                                  type="button"
                                  onClick={() => handleRetryMessage(msg.id)}
                                  className="mt-1 font-semibold text-[var(--im-link)] underline"
                                >
                                  Try again
                                </button>
                              </div>
                            )}

                            {endsGroup && (msg.durationMs !== undefined || msg.tokens) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-1 text-[11px] text-[var(--im-label-2)] tabular-nums">
                                <span className="font-medium" style={{ color: tint }}>
                                  {msg.agent === 'build' ? 'Build' : 'Plan'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{msg.model.replace('opencode/', '')}</span>
                                {msg.durationMs !== undefined && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{(msg.durationMs / 1000).toFixed(1)}s</span>
                                  </>
                                )}
                                {msg.tokens && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {(msg.tokens.input + msg.tokens.output).toLocaleString()} tok
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="im-composer-dock shrink-0 border-t border-[color:var(--im-sep)] bg-[var(--im-surface)] px-3 pt-2.5 sm:px-4">
                    {renderIosComposer(false)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* FILES VIEW IN iOS THEME */}
          {activeNav === 'files' && (
            <div className="im-scroll flex-1 overflow-y-auto px-3 py-5 sm:px-4">
              <div className="mx-auto w-full max-w-2xl space-y-4">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <h2 className="text-[24px] font-bold tracking-[-0.02em]">Files</h2>
                    <p className="mt-0.5 text-[13px] text-[var(--im-label-2)]">
                      Sandbox workspace · /tmp/opencode-workspace
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchWorkspaceFiles(selectedFilePath)}
                    aria-label="Refresh files"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--im-fill)] text-[#0b84ff] transition-colors hover:bg-[var(--im-fill-strong)]"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="overflow-hidden rounded-[14px] bg-[var(--im-surface)] ring-1 ring-[color:var(--im-sep)]">
                  <div className="max-h-[220px] divide-y divide-[color:var(--im-sep)] overflow-y-auto">
                    {workspaceFiles.length === 0 && (
                      <div className="px-4 py-4 text-[13px] text-[var(--im-label-2)]">
                        No files loaded yet.
                      </div>
                    )}
                    {workspaceFiles.map((f) => {
                      const active = selectedFilePath === f.path;
                      return (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => fetchWorkspaceFiles(f.path)}
                          className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14px] transition-colors ${
                            active ? 'bg-[#0b84ff]/10 font-medium' : 'hover:bg-[var(--im-hover)]'
                          }`}
                        >
                          <FileCode
                            className="h-4 w-4 shrink-0"
                            style={{ color: active ? APPLE_BLUE : 'var(--im-label-2)' }}
                          />
                          <span className="min-w-0 flex-1 truncate">{f.path}</span>
                          <span className="shrink-0 text-[11px] text-[var(--im-label-2)] tabular-nums">
                            {f.size} B
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-hidden rounded-[14px] bg-[var(--im-code-bg)] ring-1 ring-[color:var(--im-sep)]">
                  <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
                    <span className="truncate font-mono text-[12px] text-white/70">
                      {selectedFilePath || 'select a file'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedFileContent);
                        setCopiedFile(true);
                        setTimeout(() => setCopiedFile(false), 1600);
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {copiedFile ? (
                        <>
                          <Check className="h-3 w-3 text-[#32d74b]" />
                          <span>copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="max-h-[400px] overflow-auto p-3.5">
                    <code className="font-mono text-[12.5px] leading-relaxed text-[var(--im-code-fg)]">
                      {selectedFileContent || '// Select a file to inspect'}
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* MODELS VIEW IN iOS THEME */}
          {activeNav === 'models' && (
            <div className="im-scroll flex-1 overflow-y-auto px-3 py-5 sm:px-4">
              <div className="mx-auto w-full max-w-2xl space-y-4">
                <div className="px-1">
                  <h2 className="text-[24px] font-bold tracking-[-0.02em]">Models</h2>
                  <p className="mt-0.5 text-[13px] text-[var(--im-label-2)]">
                    OpenCode Zen · Free, no login required
                  </p>
                </div>
                <div className="overflow-hidden rounded-[14px] bg-[var(--im-surface)] ring-1 ring-[color:var(--im-sep)]">
                  <div className="divide-y divide-[color:var(--im-sep)]">
                    {models.map((m) => {
                      const current = m.id === selectedModel.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            handleModelChange(m.id);
                            setActiveNav('workspace');
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--im-hover)]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[15px] font-medium">{m.name}</span>
                              {m.reasoning && (
                                <span className="shrink-0 rounded-full bg-[var(--im-fill)] px-2 py-0.5 text-[10px] font-medium text-[var(--im-label-2)]">
                                  reasoning
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-[var(--im-label-2)]">
                              {Math.round(m.contextLimit / 1000)}K ctx · {m.speedLabel} ·{' '}
                              {m.description}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-[13px] font-medium ${
                              current ? 'text-[var(--im-green-text)]' : 'text-[#0b84ff]'
                            }`}
                          >
                            {current ? 'Active' : 'Use'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SESSIONS VIEW IN iOS THEME */}
          {activeNav === 'sessions' && (
            <div className="im-scroll flex-1 overflow-y-auto px-3 py-5 sm:px-4">
              <div className="mx-auto w-full max-w-2xl space-y-4">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <h2 className="text-[24px] font-bold tracking-[-0.02em]">Sessions</h2>
                    <p className="mt-0.5 text-[13px] text-[var(--im-label-2)]">
                      Saved locally on this device
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNewSession}
                    className="shrink-0 rounded-full bg-[#0b84ff] px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0071e3]"
                  >
                    New
                  </button>
                </div>
                <div className="overflow-hidden rounded-[14px] bg-[var(--im-surface)] ring-1 ring-[color:var(--im-sep)]">
                  <div className="divide-y divide-[color:var(--im-sep)]">
                    {threads.map((t) => {
                      const active = t.id === activeThreadId;
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--im-hover)]"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveThreadId(t.id);
                              setActiveNav('workspace');
                            }}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-[15px] font-medium">{t.title}</span>
                                {active && (
                                  <span className="shrink-0 rounded-full bg-[#34c759]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--im-green-text)]">
                                    open
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-[12px] text-[var(--im-label-2)]">
                                {t.messages.length} messages · {t.modelId} · {fmtTime(t.updatedAt)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteThread(t.id, e)}
                            aria-label="Delete session"
                            className="shrink-0 rounded-full px-2 py-1 text-[12px] text-[#ff3b30] transition-colors hover:bg-[#ff3b30]/10"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Status bar */}
        <footer className="shrink-0 flex items-center justify-between gap-3 border-t border-[color:var(--im-sep)] bg-[var(--im-bar)] px-4 py-1.5 text-[11px] text-[var(--im-label-2)]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveNav('models')}
              className="flex items-center gap-1 transition-colors hover:text-[var(--im-label)]"
            >
              <span className="text-[#34c759]">●</span>
              <span className="tabular-nums">{models.length}</span> Zen
            </button>
            <button
              type="button"
              onClick={() => setShowDeployModal(true)}
              className="flex items-center gap-1 transition-colors hover:text-[var(--im-label)]"
            >
              <span className="text-[#0b84ff]">●</span> vercel ready
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setUiTheme((prev) =>
                  prev === 'ios-light'
                    ? 'ios-dark'
                    : prev === 'ios-dark'
                      ? 'ios-auto'
                      : 'ios-light'
                )
              }
              className="rounded-full bg-[var(--im-fill)] px-2 py-0.5 font-medium text-[var(--im-label)] hover:bg-[var(--im-fill-strong)]"
            >
              {iosAppearance === 'auto' ? '◐ Auto' : iosAppearance === 'light' ? '☀︎ Light' : '☾ Dark'}
            </button>
            <button
              type="button"
              onClick={() => setUiTheme('opencode')}
              className="rounded-full bg-[#0b84ff]/15 px-2 py-0.5 font-medium text-[#0b84ff] hover:bg-[#0b84ff]/25"
            >
              Terminal UI
            </button>
          </div>
        </footer>

        {renderSharedModals()}
      </div>
    );
  }

  /* ========================================================================
     BRANCH B: OFFICIAL OPENCODE v2.2.1 TUI (1:1 Binary Port)
     ======================================================================== */
  const activeAgentColor = isBuildAgent ? 'var(--oc-build)' : 'var(--oc-plan)';
  const activeAgentLabel = isBuildAgent ? 'Build' : 'Plan';

  // Official OpenCode knight-rider block spinner frames (`function w$e` in binary)
  const renderTuiSpinner = () => {
    const blocks = ['⬝', '⬝', '⬝', '⬝', '⬝', '⬝', '⬝', '⬝'];
    return (
      <span className="inline-flex items-center tracking-tight">
        {blocks.map((_, i) => {
          const dist = Math.abs(i - spinnerFrame);
          const ch = dist === 0 ? '■' : dist === 1 ? '▪' : '⬝';
          return (
            <span
              key={i}
              style={{
                color: dist <= 1 ? activeAgentColor : 'var(--oc-fg-dim)',
                opacity: dist === 0 ? 1 : dist === 1 ? 0.75 : 0.35
              }}
            >
              {ch}
            </span>
          );
        })}
      </span>
    );
  };

  /**
   * Exact 1:1 port of `function fo` + `function Zs` + `function Rl` (`prompt.footer`)
   * from the official OpenCode v2.2.1 TUI binary.
   */
  const renderOfficialTuiPrompt = (centered = false) => (
    <div className={`w-full ${centered ? 'max-w-[680px] mx-auto' : 'w-full'} relative`}>
      {/* Official TUI autocomplete popup (`function aPt` in binary) */}
      {showSlashMenu && matchingSlashCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-30 mb-1 border border-[color:var(--oc-border)] bg-[var(--oc-panel)] py-1 shadow-2xl">
          {matchingSlashCommands.map((item, idx) => (
            <button
              key={item.cmd}
              type="button"
              onClick={() => executeSlashCommand(item.cmd)}
              className={`group flex w-full items-center justify-between px-3 py-1 text-left text-[12.5px] ${
                idx === 0 ? 'bg-[var(--oc-elevated)]' : 'hover:bg-[var(--oc-elevated)]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-bold text-[var(--oc-build)]">{item.cmd}</span>
                <span className="truncate text-[var(--oc-fg-muted)]">{item.desc}</span>
              </div>
              <span className="ml-4 shrink-0 text-[11.5px] text-[var(--oc-fg-muted)]">
                {item.keybind}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Prompt Box (`border: ["left"], customBorderChars: { vertical: "┃", bottomLeft: "╹" }`) */}
      <div className="flex flex-col">
        <div
          className="bg-[var(--oc-panel)] pl-4 pr-3 pt-2.5 pb-2"
          style={{
            borderLeftWidth: '3px',
            borderLeftStyle: 'solid',
            borderLeftColor: activeAgentColor
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask anything… "${OPENCODE_PLACEHOLDERS[placeholderIdx]}"`}
            className="max-h-36 w-full resize-none bg-transparent font-mono text-[13.5px] leading-relaxed text-[var(--oc-fg)] placeholder-[var(--oc-fg-muted)] focus:outline-none"
          />

          {/* Metadata line inside prompt box (`function Zs` in binary) */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAgentToggle}
                title="Switch agent (tab)"
                className="font-semibold transition-opacity hover:opacity-80"
                style={{ color: activeAgentColor }}
              >
                {activeAgentLabel}
              </button>
              <button
                type="button"
                onClick={() => setShowModelModal(true)}
                title="Select model (ctrl+m)"
                className="truncate text-[var(--oc-fg)] transition-opacity hover:opacity-80"
              >
                {selectedModel.name}
              </button>
              <span className="text-[var(--oc-fg-muted)]">OpenCode Zen</span>
            </div>

            {inputPrompt.trim().length > 0 && !isStreaming && (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                className="text-[11.5px] text-[var(--oc-build)] hover:underline"
              >
                enter ↵
              </button>
            )}
          </div>
        </div>

        {/* Bottom-left cap `╹` + shadow line from `function fo` */}
        <div className="flex h-[6px] w-full items-start select-none leading-none">
          <span
            className="inline-block w-[3px] h-[3px]"
            style={{ backgroundColor: activeAgentColor }}
          />
          <span className="flex-1 h-[2px] bg-[var(--oc-panel)] opacity-60" />
        </div>
      </div>

      {/* Prompt Footer (`id: "prompt.footer"` / `function Rl` in binary) */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--oc-fg-muted)]">
        {/* Left: `prompt.footer.status` */}
        <div className="flex min-w-0 items-center gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="flex items-center gap-2 hover:opacity-80"
            >
              {renderTuiSpinner()}
              <span>
                <span className="text-[var(--oc-fg)]">esc </span>
                <span className="text-[var(--oc-fg-muted)]">interrupt</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                fetchWorkspaceFiles();
                setShowFilesModal(true);
              }}
              className="truncate text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
              title="Inspect workspace files (/files)"
            >
              ~/opaslabs/workspace
            </button>
          )}
        </div>

        {/* Right: `shortcuts` (`tab agents`, `ctrl+p commands`) */}
        <div className="flex shrink-0 items-center gap-4">
          {totalSessionTokens > 0 && (
            <span className="hidden sm:inline tabular-nums text-[var(--oc-fg-muted)]">
              {totalSessionTokens.toLocaleString()} tok · $0.00
            </span>
          )}
          <button
            type="button"
            onClick={handleAgentToggle}
            className="hover:opacity-80"
          >
            <span className="text-[var(--oc-fg)]">tab </span>
            <span className="text-[var(--oc-fg-muted)]">agents</span>
          </button>
          <button
            type="button"
            onClick={() => setShowThemeModal(true)}
            className="hover:opacity-80"
          >
            <span className="text-[var(--oc-fg)]">/themes </span>
            <span className="text-[var(--oc-fg-muted)]">({currentThemeObj.id})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCommandModal(true)}
            className="hover:opacity-80"
          >
            <span className="text-[var(--oc-fg)]">ctrl+p </span>
            <span className="text-[var(--oc-fg-muted)]">commands</span>
          </button>
        </div>
      </div>
    </div>
  );

  /**
   * Exact 1:1 port of tool call rendering (`function gd` / `Dr` / `i1` from the binary)
   */
  const renderOfficialTuiTool = (tool: ToolEventItem) => {
    const nameLower = (tool.name || 'tool').toLowerCase();
    let icon = '✓';
    let label = tool.name;
    const argPreview = tool.title
      ? tool.title
      : tool.input
        ? Object.values(tool.input)
            .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
            .join(' ')
        : '';

    if (nameLower.includes('read')) {
      icon = '→';
      label = 'Read';
    } else if (nameLower.includes('write') || nameLower.includes('edit')) {
      icon = '←';
      label = 'Write';
    } else if (nameLower.includes('glob') || nameLower.includes('grep')) {
      icon = '✱';
      label = nameLower.includes('glob') ? 'Glob' : 'Grep';
    } else if (nameLower.includes('bash') || nameLower.includes('shell')) {
      icon = '$';
      label = '';
    }

    if (tool.status === 'running') {
      icon = '⬝';
    } else if (tool.status === 'error') {
      icon = '✗';
    }

    return (
      <div
        key={tool.id}
        className="my-1 flex items-center gap-2 font-mono text-[12.5px] text-[var(--oc-fg-muted)]"
      >
        <span
          style={{
            color:
              tool.status === 'error'
                ? 'var(--oc-danger)'
                : tool.status === 'running'
                  ? activeAgentColor
                  : 'var(--oc-fg-muted)'
          }}
        >
          {icon}
        </span>
        {label && <span className="text-[var(--oc-fg-muted)]">{label}</span>}
        <span className="truncate text-[var(--oc-fg)]">{argPreview}</span>
      </div>
    );
  };

  const contextPercent = Math.min(
    100,
    Math.round((totalSessionTokens / (selectedModel.contextLimit || 128000)) * 100)
  );

  return (
    <div
      data-oc-palette={uiTheme}
      className="oc-app flex h-dvh w-full flex-col overflow-hidden bg-[var(--oc-bg)] font-mono text-[var(--oc-fg)] antialiased"
    >
      {activeThread.messages.length === 0 ? (
        /* ====================================================================
           1. OFFICIAL OPENCODE v2.2.1 TUI HOME SCREEN (`function aa` + `Fl`)
           ==================================================================== */
        <div className="flex h-full w-full flex-col justify-between overflow-hidden">
          {/* Top spacer */}
          <div className="shrink-0" />

          {/* Centered Logo (`_U`) + Prompt Box (`fo`) */}
          <div className="oc-scroll flex flex-1 flex-col items-center justify-center overflow-y-auto px-4">
            <div className="w-full max-w-[680px]">
              {/* Official 4-Row Block Art Logo (`_U`) */}
              <div className="mb-5 flex justify-center">
                <OfficialTuiLogo />
              </div>

              {/* Official Left-Bordered Prompt Box (`fo`) */}
              {renderOfficialTuiPrompt(true)}
            </div>
          </div>

          {/* Official Home Bottom Footer (`id: "home.footer"` / `function Fl`) */}
          <footer className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 pb-2.5 pt-1 text-[12px] text-[var(--oc-fg-muted)]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  fetchWorkspaceFiles();
                  setShowFilesModal(true);
                }}
                className="hover:text-[var(--oc-fg)]"
              >
                ~/opaslabs/workspace:main
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setShowModelModal(true)}
                className="flex items-center gap-1.5 hover:opacity-80"
              >
                <span className="text-[var(--oc-green)]">●</span>
                <span className="text-[var(--oc-fg)]">1 MCP</span>
                <span className="text-[var(--oc-fg-muted)]">/models</span>
              </button>
              <button
                type="button"
                onClick={() => setShowThemeModal(true)}
                className="hover:text-[var(--oc-fg)]"
              >
                /themes
              </button>
              <button
                type="button"
                onClick={() => setShowDeployModal(true)}
                className="hover:text-[var(--oc-fg)]"
              >
                /vercel
              </button>
            </div>

            <div className="text-[var(--oc-fg-muted)]">v2.2.1</div>
          </footer>
        </div>
      ) : (
        /* ====================================================================
           2. OFFICIAL OPENCODE v2.2.1 TUI SESSION SCREEN (`function Dl` + `Li`)
           ==================================================================== */
        <div className="flex h-full w-full flex-row overflow-hidden">
          {/* Left Session Pane (`id: "session-pane"`) */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Scrollable message list */}
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottomRef.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 96;
              }}
              className="oc-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2 sm:px-6"
            >
              <div className="mx-auto max-w-4xl space-y-4">
                {activeThread.messages.map((msg, idx) => {
                  const hasReasoning = Boolean(
                    msg.reasoning && msg.reasoning.trim().length > 0
                  );
                  const isReasoningOpen = Boolean(expandedReasoning[msg.id]);
                  const msgAgentColor =
                    msg.agent === 'build' ? 'var(--oc-build)' : 'var(--oc-plan)';
                  const msgAgentLabel = msg.agent === 'build' ? 'Build' : 'Plan';

                  /* ---- User Message (`function ud` in binary) ---- */
                  if (msg.role === 'user') {
                    return (
                      <div
                        key={msg.id}
                        className="bg-[var(--oc-panel)] pl-4 pr-3 py-2.5"
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftStyle: 'solid',
                          borderLeftColor: msgAgentColor
                        }}
                      >
                        <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[var(--oc-fg)]">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }

                  /* ---- Assistant Turn (`function Zu`, `BLe`, `gd`, `bU`, `ed`) ---- */
                  const validSegments = (msg.segments || []).filter(
                    (s) => s.kind === 'tool' || s.text.trim().length > 0
                  );
                  const hasAnyText =
                    validSegments.some((s) => s.kind === 'text') ||
                    msg.content.trim().length > 0;
                  const isLastAssistant = idx === activeThread.messages.length - 1;

                  return (
                    <div key={msg.id} className="pl-4 sm:pl-5 space-y-2">
                      {/* Thinking row (`function BLe` / `APt`: `+ Thought` in warning `#f5a742`) */}
                      {hasReasoning && (
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReasoning((prevOpen) => ({
                                ...prevOpen,
                                [msg.id]: !prevOpen[msg.id]
                              }))
                            }
                            className="flex items-center gap-1.5 text-[12.5px] text-[var(--oc-warning)] hover:opacity-85"
                          >
                            <span>{isReasoningOpen ? '-' : '+'}</span>
                            <span>
                              {isStreaming && isLastAssistant && !hasAnyText
                                ? 'Thinking'
                                : 'Thought'}
                            </span>
                          </button>
                          {isReasoningOpen && (
                            <div className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap border-l-2 border-[color:var(--oc-elevated)] pl-3 py-1 text-[12.5px] italic text-[var(--oc-fg-muted)]">
                              {msg.reasoning}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interleaved Tool Calls & Assistant Markdown (`function bU`) */}
                      {validSegments.length > 0 ? (
                        <div className="space-y-2">
                          {validSegments.map((seg) =>
                            seg.kind === 'tool' ? (
                              renderOfficialTuiTool(seg.tool)
                            ) : (
                              <MarkdownRenderer
                                key={seg.id}
                                content={seg.text}
                                variant="terminal"
                              />
                            )
                          )}
                        </div>
                      ) : msg.content.trim().length > 0 ? (
                        <MarkdownRenderer content={msg.content} variant="terminal" />
                      ) : !msg.error && isStreaming && isLastAssistant && !hasAnyText && !hasReasoning ? (
                        <div className="flex items-center gap-2 py-0.5 text-[12.5px] text-[var(--oc-warning)]">
                          {renderTuiSpinner()}
                          <span>Thinking</span>
                        </div>
                      ) : null}

                      {validSegments.length === 0 &&
                        msg.tools &&
                        msg.tools.length > 0 && (
                          <div className="space-y-1">
                            {msg.tools.map(renderOfficialTuiTool)}
                          </div>
                        )}

                      {/* Error banner (`function xLe`) */}
                      {msg.error && (
                        <div
                          className="bg-[var(--oc-panel)] pl-3 pr-3 py-2 text-[12.5px] text-[var(--oc-fg-muted)]"
                          style={{
                            borderLeftWidth: '3px',
                            borderLeftStyle: 'solid',
                            borderLeftColor: 'var(--oc-danger)'
                          }}
                        >
                          <div className="text-[var(--oc-danger)]">{msg.error}</div>
                          <button
                            type="button"
                            onClick={() => handleRetryMessage(msg.id)}
                            className="mt-1 text-[11.5px] text-[var(--oc-build)] hover:underline"
                          >
                            retry
                          </button>
                        </div>
                      )}

                      {/* Turn Metadata Footer (`function ed`: `▣ Build · model · 1.4s`) */}
                      {(!isStreaming || !isLastAssistant) && !msg.error && (
                        <div className="pt-1 text-[12px] text-[var(--oc-fg-muted)]">
                          <span style={{ color: msgAgentColor }}>▣ </span>
                          <span style={{ color: msgAgentColor }}>{msgAgentLabel}</span>
                          <span> · </span>
                          <span>{msg.model.replace('opencode/', '')}</span>
                          {msg.durationMs !== undefined && (
                            <>
                              <span> · </span>
                              <span>{(msg.durationMs / 1000).toFixed(1)}s</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Prompt Box (`function fo`) */}
            <div className="shrink-0 px-4 pb-2.5 pt-1 sm:px-6">
              <div className="mx-auto max-w-4xl">{renderOfficialTuiPrompt(false)}</div>
            </div>
          </div>

          {/* Official Right Sidebar (`function Li` in binary, width 32ch / 280px) */}
          {showTuiSidebar && (
            <aside className="hidden lg:flex w-[280px] shrink-0 flex-col justify-between bg-[var(--oc-panel)] px-4 py-3 text-[12.5px]">
              <div className="oc-scroll flex-1 space-y-5 overflow-y-auto pr-1">
                {/* Session Title + New Session */}
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-[var(--oc-fg)] break-words">
                    {activeThread.title}
                  </div>
                  <button
                    type="button"
                    onClick={handleNewSession}
                    className="shrink-0 text-[11.5px] text-[var(--oc-build)] hover:underline"
                    title="New session (ctrl+n)"
                  >
                    + new
                  </button>
                </div>

                {/* Context Section (`function Al` in binary) */}
                <div>
                  <div className="font-bold text-[var(--oc-fg)]">Context</div>
                  <div className="mt-0.5 space-y-0.5 text-[var(--oc-fg-muted)] tabular-nums">
                    <div>{totalSessionTokens.toLocaleString()} tokens</div>
                    <div>{contextPercent}% used</div>
                    <div>$0.00 spent</div>
                  </div>
                </div>

                {/* MCP / Runtime Section (`function Gl` in binary) */}
                <div>
                  <div className="font-bold text-[var(--oc-fg)]">MCP</div>
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--oc-green)]">•</span>
                      <span className="text-[var(--oc-fg)]">opencode-zen</span>
                      <span className="text-[var(--oc-fg-muted)]">Connected</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeployModal(true)}
                      className="flex items-center gap-2 text-left hover:opacity-80"
                    >
                      <span className="text-[var(--oc-green)]">•</span>
                      <span className="text-[var(--oc-fg)]">vercel-gateway</span>
                      <span className="text-[var(--oc-fg-muted)]">Ready</span>
                    </button>
                  </div>
                </div>

                {/* Modified / Workspace Files Section */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--oc-fg)]">Files</span>
                    <button
                      type="button"
                      onClick={() => {
                        fetchWorkspaceFiles();
                        setShowFilesModal(true);
                      }}
                      className="text-[11.5px] text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
                    >
                      open
                    </button>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {workspaceFiles.slice(0, 6).map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => {
                          fetchWorkspaceFiles(f.path);
                          setShowFilesModal(true);
                        }}
                        className="flex w-full items-center justify-between text-left text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
                      >
                        <span className="truncate">{f.path}</span>
                        <span className="ml-2 shrink-0 text-[11px] text-[var(--oc-green)]">
                          {f.size}B
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sessions Section */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--oc-fg)]">Sessions</span>
                    <button
                      type="button"
                      onClick={() => setShowSessionsModal(true)}
                      className="text-[11.5px] text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]"
                    >
                      all ({threads.length})
                    </button>
                  </div>
                  <div className="mt-1 space-y-1">
                    {threads.slice(0, 4).map((t) => {
                      const active = t.id === activeThreadId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveThreadId(t.id)}
                          className={`flex w-full items-center gap-1.5 text-left ${
                            active
                              ? 'text-[var(--oc-build)] font-semibold'
                              : 'text-[var(--oc-fg-muted)] hover:text-[var(--oc-fg)]'
                          }`}
                        >
                          <span>{active ? '•' : ' '}</span>
                          <span className="truncate">{t.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sidebar Footer (`function Il` in binary) */}
              <div className="pt-3 border-t border-[color:var(--oc-elevated)] space-y-1 text-[11.5px] text-[var(--oc-fg-muted)]">
                <div className="truncate">~/opaslabs/workspace:main</div>
                <div className="flex items-center justify-between">
                  <span>
                    <span className="text-[var(--oc-green)]">• </span>
                    <span className="font-bold text-[var(--oc-fg)]">Open</span>
                    <span className="text-[var(--oc-fg)]">Code</span>
                    <span> v2.2.1</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowThemeModal(true)}
                    className="text-[var(--oc-build)] hover:underline"
                  >
                    /themes
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {renderSharedModals()}
    </div>
  );
}
