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
  CornerDownLeft
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

const STORAGE_KEY = 'opas_labs_opencode_threads_v1';

// Exact 39-column x 4-row glyph matrix from official OpenCode TUI (vy.left + " " + vy.right)
// Cols 0..18 = "open", Col 19 = " ", Cols 20..38 = "code" (with '▄' at col 33 over the right stem of 'd')
const LOGO_ROWS = [
  '                                 ▄     ',
  '█▀▀█ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█',
  '█░░█ █░░█ █^^^ █░░█ █░░░ █░░█ █░░█ █^^^',
  '▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀'
];

const OPENCODE_PLACEHOLDERS = [
  'Fix a TODO in the codebase',
  'What is the tech stack of this project?',
  'Fix broken tests',
  'Write a TypeScript sliding-window rate limiter'
];

function OpasOpenCodeLogo() {
  return (
    <div className="select-none flex flex-col items-center">
      <div className="inline-flex flex-col">
        {/* opaslabs brand header aligned strictly to the 39-column logo edges */}
        <div className="w-full flex items-center justify-between mb-1.5 font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#fab283] font-bold tracking-wider uppercase">
              opaslabs
            </span>
            <span className="text-[#4a4a4a]" aria-hidden="true">
              /
            </span>
            <span className="text-[#808080]">opencode</span>
          </div>
          <span className="text-[11px] text-[#808080]">free zen · no login</span>
        </div>

        {/* Strict 39-column x 4-row CSS Grid guarantees sub-pixel column alignment across all OS/browsers */}
        <div
          role="img"
          aria-label="opaslabs opencode logo"
          className="inline-grid grid-cols-[repeat(39,1ch)] font-mono text-xs sm:text-sm md:text-[15px] leading-none"
        >
          {LOGO_ROWS.map((row, rowIdx) =>
            Array.from(row).map((ch, colIdx) => {
              const isRightHalf = colIdx >= 20;
              const fgBase = isRightHalf ? 'text-[#eeeeee]' : 'text-[#808080]';
              const shadowBg = isRightHalf ? 'bg-[#262626]' : 'bg-[#1a1a1a]';
              const shadowFg = isRightHalf ? 'text-[#333333]' : 'text-[#242424]';

              if (ch === ' ') {
                return (
                  <span
                    key={`${rowIdx}-${colIdx}`}
                    className="w-[1ch] h-[1.12em] flex items-center justify-center opacity-0 pointer-events-none"
                    aria-hidden="true"
                  >
                    █
                  </span>
                );
              }

              if (ch === '░') {
                return (
                  <span
                    key={`${rowIdx}-${colIdx}`}
                    className={`w-[1ch] h-[1.12em] flex items-center justify-center ${shadowFg} ${shadowBg}`}
                  >
                    ░
                  </span>
                );
              }

              if (ch === '^') {
                return (
                  <span
                    key={`${rowIdx}-${colIdx}`}
                    className={`w-[1ch] h-[1.12em] flex items-center justify-center ${fgBase} ${shadowBg}`}
                  >
                    ▀
                  </span>
                );
              }

              if (ch === '~') {
                return (
                  <span
                    key={`${rowIdx}-${colIdx}`}
                    className={`w-[1ch] h-[1.12em] flex items-center justify-center ${shadowFg}`}
                  >
                    ▀
                  </span>
                );
              }

              return (
                <span
                  key={`${rowIdx}-${colIdx}`}
                  className={`w-[1ch] h-[1.12em] flex items-center justify-center ${fgBase}`}
                >
                  {ch}
                </span>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const SLASH_COMMANDS = [
  { cmd: '/models', desc: 'Switch OpenCode Zen free model', keybind: 'ctrl+m' },
  { cmd: '/agent', desc: 'Switch Build / Plan agent', keybind: 'tab' },
  { cmd: '/new', desc: 'Start a new session', keybind: 'ctrl+n' },
  { cmd: '/files', desc: 'Inspect sandbox workspace files', keybind: 'ctrl+f' },
  { cmd: '/sessions', desc: 'Browse saved sessions', keybind: 'ctrl+s' },
  { cmd: '/clear', desc: 'Clear current session transcript', keybind: 'ctrl+l' }
];

const STARTER_PROMPTS = [
  {
    title: 'Fix a TODO or write a TypeScript rate limiter',
    agent: 'build' as const,
    prompt: 'Write a production-ready sliding window rate limiter in TypeScript with zero external dependencies and unit tests. Reply directly in markdown.'
  },
  {
    title: 'Benchmark Map vs Object in sandbox',
    agent: 'build' as const,
    prompt: 'Create a file named benchmark.js in the workspace that benchmarks Map vs Object lookup speed in Node.js, run it, and report the exact numbers.'
  },
  {
    title: 'PostgreSQL composite index query plan',
    agent: 'plan' as const,
    prompt: 'Explain how composite B-Tree indexes work in PostgreSQL when filtering by equality on one column and range on a second column, with concrete EXPLAIN examples.'
  },
  {
    title: 'Build a custom React SSE streaming hook',
    agent: 'build' as const,
    prompt: 'Write a clean React useSSEStream hook in TypeScript with automatic reconnection, AbortController cleanup, and typed event callbacks.'
  }
];

function createEmptyThread(modelId = 'glm-5.3-flash-free', agent: 'build' | 'plan' = 'build'): ChatThread {
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
      description: 'Fast chain-of-thought software engineering and debugging model on OpenCode Zen.'
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
      description: 'OpenCode Zen flagship free coding model tuned for multi-step agentic workflows.'
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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [createEmptyThread()];
  });

  const [activeThreadId, setActiveThreadId] = useState<string>(() => threads[0]?.id || '');
  const [activeNav, setActiveNav] = useState<'workspace' | 'files' | 'models' | 'sessions'>('workspace');
  const [inputPrompt, setInputPrompt] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [showModelModal, setShowModelModal] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  // Workspace Sandbox state
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('README.md');
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];
  const selectedModel = models.find((m) => m.id === activeThread?.modelId) || models[0];

  const showSlashMenu = inputPrompt.startsWith('/') && !inputPrompt.includes(' ');
  const matchingSlashCommands = showSlashMenu
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(inputPrompt.toLowerCase()))
    : [];

  // Cycle placeholder just like OpenCode TUI (Se.placeholder % Je().length)
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
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.models) && data.models.length > 0) {
          setModels(data.models);
        }
      })
      .catch(() => {});
  }, []);

  // Global keyboard shortcuts matching OpenCode TUI
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowModelModal((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewSession();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActiveNav((prev) => (prev === 'files' ? 'workspace' : 'files'));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setActiveNav((prev) => (prev === 'sessions' ? 'workspace' : 'sessions'));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleClearCurrentSession();
      } else if (e.key === 'Escape') {
        if (showModelModal) {
          setShowModelModal(false);
        } else if (isStreaming) {
          handleStopGeneration();
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [showModelModal, isStreaming, selectedModel.id, activeThread?.agent]);

  const fetchWorkspaceFiles = async (selectPath?: string) => {
    setLoadingFiles(true);
    try {
      const res = await fetch('/api/workspace/files');
      const data = await res.json();
      if (Array.isArray(data?.files)) {
        setWorkspaceFiles(data.files);
        const target = selectPath || selectedFilePath || data.files[0]?.path;
        if (target) {
          setSelectedFilePath(target);
          const fRes = await fetch(`/api/workspace/file?path=${encodeURIComponent(target)}`);
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
    if (activeNav === 'files') {
      fetchWorkspaceFiles();
    }
  }, [activeNav]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length, isStreaming]);

  const updateThread = (threadId: string, updater: (t: ChatThread) => ChatThread) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? updater(t) : t)));
  };

  const handleNewSession = () => {
    if (isStreaming) handleStopGeneration();
    const fresh = createEmptyThread(selectedModel.id, activeThread?.agent || 'build');
    setThreads((prev) => [fresh, ...prev]);
    setActiveThreadId(fresh.id);
    setActiveNav('workspace');
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
    setThreads((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        const fresh = createEmptyThread(selectedModel.id, 'build');
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (activeThreadId === id) {
        setActiveThreadId(filtered[0].id);
      }
      return filtered;
    });
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

  const executeSlashCommand = (cmd: string) => {
    setInputPrompt('');
    switch (cmd) {
      case '/models':
        setShowModelModal(true);
        break;
      case '/new':
        handleNewSession();
        break;
      case '/agent':
        handleAgentToggle();
        break;
      case '/sessions':
        setActiveNav('sessions');
        break;
      case '/files':
        setActiveNav('files');
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
      fetch('/api/chat/interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: activeThread.opencodeSessionID })
      }).catch(() => {});
    }
  };

  const handleSendMessage = async (overrideText?: string, overrideAgent?: 'build' | 'plan') => {
    const text = (overrideText ?? inputPrompt).trim();
    if (!text || isStreaming || !activeThread) return;

    if (text.startsWith('/') && !overrideText) {
      const matched = SLASH_COMMANDS.find((c) => c.cmd === text.toLowerCase());
      if (matched) {
        executeSlashCommand(matched.cmd);
        return;
      }
    }

    const currentThreadId = activeThread.id;
    const currentModel = selectedModel;
    const currentAgent = overrideAgent ?? activeThread.agent;

    if (!overrideText) setInputPrompt('');
    setActiveNav('workspace');

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
      tools: []
    };

    setExpandedReasoning((prev) => ({ ...prev, [assistantMsgId]: true }));

    updateThread(currentThreadId, (t) => ({
      ...t,
      agent: currentAgent,
      title: t.messages.length === 0 ? text.slice(0, 48) : t.title,
      updatedAt: Date.now(),
      messages: [...t.messages, userMsg, assistantPlaceholder]
    }));

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          modelId: currentModel.id,
          sessionID: activeThread.opencodeSessionID,
          agent: currentAgent
        }),
        signal: controller.signal
      });

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
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + ev.delta }
                    : m
                )
              }));
            } else if (ev.type === 'text_done' && typeof ev.text === 'string') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId && !m.content ? { ...m, content: ev.text } : m
                )
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
                        ]
                      }
                    : m
                )
              }));
            } else if (ev.type === 'tool_call') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        tools: (m.tools || []).map((tl) =>
                          tl.id === ev.id ? { ...tl, input: ev.input } : tl
                        )
                      }
                    : m
                )
              }));
            } else if (ev.type === 'tool_result') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        tools: (m.tools || []).map((tl) =>
                          tl.id === ev.id
                            ? { ...tl, status: 'done', title: ev.title }
                            : tl
                        )
                      }
                    : m
                )
              }));
            } else if (ev.type === 'tool_error') {
              updateThread(currentThreadId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        tools: (m.tools || []).map((tl) =>
                          tl.id === ev.id
                            ? { ...tl, status: 'error', error: String(ev.error || 'Tool error') }
                            : tl
                        )
                      }
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

  // Exact replica of the official OpenCode TUI Prompt Box (`fo` + `Zs` + `prompt.footer`)
  const renderOpenCodePromptBox = (centered = false) => (
    <div className={`w-full ${centered ? 'max-w-[680px] mx-auto' : 'max-w-4xl mx-auto'} relative font-mono`}>
      {/* Slash Command Autocomplete Popup */}
      {showSlashMenu && matchingSlashCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 border border-[#2a2a2a] bg-[#141414] shadow-2xl overflow-hidden z-20">
          <div className="divide-y divide-[#1f1f1f]">
            {matchingSlashCommands.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => executeSlashCommand(item.cmd)}
                className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[#1e1e1e] transition-colors text-xs"
              >
                <div>
                  <span className="text-[#fab283] font-semibold">{item.cmd}</span>
                  <span className="text-[#808080] ml-3">{item.desc}</span>
                </div>
                <span className="text-[#808080] text-[11px]">{item.keybind}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Prompt Surface (`qe` + `at` in OpenCode TUI: flat #141414 surface with left agent bar) */}
      <div className="flex items-stretch bg-[#141414]">
        {/* Left Agent Color Bar (`border: ["left"]` in OpenCode TUI) */}
        <div
          aria-hidden="true"
          className={`w-[3px] shrink-0 transition-colors ${
            isBuildAgent ? 'bg-[#fab283]' : 'bg-[#5c9cf5]'
          }`}
        />

        <div className="flex-1 px-4 pt-3 pb-2.5 flex flex-col justify-between">
          {/* Prompt Textarea (`tt`) */}
          <div className="flex items-start gap-2">
            <textarea
              ref={textareaRef}
              rows={centered ? 2 : 2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask anything… "${OPENCODE_PLACEHOLDERS[placeholderIdx]}"`}
              className="flex-1 bg-transparent font-mono text-sm text-[#eeeeee] placeholder-[#808080] resize-none focus:outline-none leading-relaxed max-h-40"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-[#0a0a0a] bg-[#fab283] hover:bg-[#ffc49b] transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>esc interrupt</span>
              </button>
            ) : (
              inputPrompt.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold text-[#0a0a0a] bg-[#fab283] hover:bg-[#ffc49b] transition-colors whitespace-nowrap shrink-0"
                >
                  <CornerDownLeft className="w-3 h-3" />
                  <span>enter</span>
                </button>
              )
            )}
          </div>

          {/* `Zs` Status Row inside Prompt Box: Agent · auto · Model · Provider */}
          <div className="mt-2 pt-1 flex flex-wrap items-center justify-between gap-2 text-xs select-none">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleAgentToggle}
                title="Switch agent (Tab)"
                className={`font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isBuildAgent
                    ? 'text-[#fab283] hover:text-[#ffc49b]'
                    : 'text-[#5c9cf5] hover:text-[#7db2ff]'
                }`}
              >
                {isBuildAgent ? 'Build' : 'Plan'}
              </button>
              <span className="text-[#808080]">auto</span>
              <span className="text-[#808080]" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                onClick={() => setShowModelModal(true)}
                title="Select Free OpenCode Model (Ctrl+M)"
                className="text-[#eeeeee] hover:text-white truncate transition-colors"
              >
                {selectedModel.name}
              </button>
              <span className="text-[#808080] hidden sm:inline">OpenCode Zen</span>
              <span className="text-[#808080] hidden md:inline" aria-hidden="true">
                ·
              </span>
              <span className="text-[#fab283]/90 hidden md:inline">opaslabs</span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#808080] shrink-0">
              <button
                type="button"
                onClick={handleAgentToggle}
                className="hover:text-[#eeeeee] transition-colors"
              >
                <span className="text-[#eeeeee]">tab</span> agent
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setShowModelModal(true)}
                className="hover:text-[#eeeeee] transition-colors"
              >
                <span className="text-[#eeeeee]">ctrl+m</span> models
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Authentic OpenCode TUI Bottom-Left Corner Cap (`╹` + shadow line) */}
      <div className="flex items-center h-1 select-none" aria-hidden="true">
        <div
          className={`w-[3px] h-full ${
            isBuildAgent ? 'bg-[#fab283]/60' : 'bg-[#5c9cf5]/60'
          }`}
        />
        <div className="flex-1 h-full bg-[#0f0f0f]" />
      </div>

      {/* `prompt.footer` Row right below the box */}
      <div className="mt-1.5 flex items-center justify-between text-xs text-[#808080] select-none px-0.5">
        <button
          type="button"
          onClick={() => setActiveNav('files')}
          className="hover:text-[#eeeeee] transition-colors truncate"
        >
          ~/opaslabs/workspace:main
        </button>
        <div className="flex items-center gap-3 text-[11px] shrink-0">
          <span>
            <span className="text-[#eeeeee]">/</span> commands
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!inputPrompt.trim() || isStreaming}
            className="hover:text-[#eeeeee] disabled:opacity-40 transition-colors"
          >
            <span className="text-[#eeeeee]">enter</span> send
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-[#eeeeee] font-mono">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-2.5 border-b border-[#1e1e1e] bg-[#0a0a0a] sticky top-0 z-30">
        {/* Zone 1: Wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('workspace');
          }}
          className="text-xs font-mono font-bold tracking-wider text-[#eeeeee] whitespace-nowrap shrink-0"
        >
          <span className="text-[#fab283]">opaslabs</span> / opencode
        </a>

        {/* Zone 2: 4 concise single-line text links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-mono text-[#808080]">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('workspace');
            }}
            className={`hover:text-[#eeeeee] transition-colors whitespace-nowrap shrink-0 ${
              activeNav === 'workspace' ? 'text-[#eeeeee]' : ''
            }`}
          >
            tui
          </a>
          <a
            href="#models"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('models');
            }}
            className={`hover:text-[#eeeeee] transition-colors whitespace-nowrap shrink-0 ${
              activeNav === 'models' ? 'text-[#eeeeee]' : ''
            }`}
          >
            /models ({models.length})
          </a>
          <a
            href="#files"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('files');
            }}
            className={`hover:text-[#eeeeee] transition-colors whitespace-nowrap shrink-0 ${
              activeNav === 'files' ? 'text-[#eeeeee]' : ''
            }`}
          >
            /files
          </a>
          <a
            href="#sessions"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('sessions');
            }}
            className={`hover:text-[#eeeeee] transition-colors whitespace-nowrap shrink-0 ${
              activeNav === 'sessions' ? 'text-[#eeeeee]' : ''
            }`}
          >
            /sessions ({threads.length})
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleNewSession}
            className="px-3 py-1 text-xs font-mono font-semibold text-[#0a0a0a] bg-[#eeeeee] hover:bg-white transition-colors whitespace-nowrap shrink-0"
          >
            + new session
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* VIEW 1: EXACT OPENCODE TUI SCREEN */}
        {activeNav === 'workspace' && (
          <div className="flex-1 flex flex-col min-h-0">
            {activeThread.messages.length === 0 ? (
              /* EXACT OPENCODE TUI HOME SCREEN (`aa()` in binary) */
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
                <div className="w-full max-w-[680px] space-y-6">
                  {/* 1. Official OpenCode Two-Tone ASCII Logo with opaslabs */}
                  <OpasOpenCodeLogo />

                  {/* 2. Official OpenCode Prompt Box (`fo` + `Zs`) */}
                  {renderOpenCodePromptBox(true)}

                  {/* 3. Subtle TUI Starter Prompts */}
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#808080] px-0.5">
                      <span>try a prompt (zero login · opencode/{selectedModel.id})</span>
                      <button
                        type="button"
                        onClick={() => setShowModelModal(true)}
                        className="hover:text-[#eeeeee] transition-colors"
                      >
                        change model →
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STARTER_PROMPTS.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSendMessage(item.prompt, item.agent)}
                          className="text-left px-3 py-2 bg-[#141414] hover:bg-[#1e1e1e] border border-[#1f1f1f] transition-colors text-xs"
                        >
                          <div className="text-[#eeeeee] truncate">{item.title}</div>
                          <div className="text-[11px] text-[#808080] mt-0.5 truncate">
                            <span
                              className={
                                item.agent === 'build' ? 'text-[#fab283]' : 'text-[#5c9cf5]'
                              }
                            >
                              {item.agent}
                            </span>{' '}
                            · opencode/{selectedModel.id}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* EXACT OPENCODE TUI SESSION TRANSCRIPT VIEW */
              <>
                {/* Session Header Bar */}
                <div className="border-b border-[#1e1e1e] bg-[#0f0f0f] px-6 py-2">
                  <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-[#808080] tabular-nums">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#fab283] font-semibold">opaslabs</span>
                      <span aria-hidden="true">/</span>
                      <span className="text-[#eeeeee] font-semibold truncate">
                        {activeThread.title}
                      </span>
                      {activeThread.opencodeSessionID && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#808080]">
                            {activeThread.opencodeSessionID.slice(0, 14)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span>{totalSessionTokens.toLocaleString()} tok</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#7fd88f]">$0.00 (free)</span>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={handleClearCurrentSession}
                        className="hover:text-[#eeeeee] transition-colors"
                      >
                        /clear
                      </button>
                    </div>
                  </div>
                </div>

                {/* Messages Transcript */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
                  <div className="max-w-4xl mx-auto space-y-6">
                    {activeThread.messages.map((msg) => {
                      const isUser = msg.role === 'user';
                      const hasReasoning = Boolean(msg.reasoning && msg.reasoning.trim().length > 0);
                      const isReasoningOpen = Boolean(expandedReasoning[msg.id]);

                      if (isUser) {
                        return (
                          <div
                            key={msg.id}
                            className="flex items-stretch bg-[#141414]"
                          >
                            <div
                              aria-hidden="true"
                              className={`w-[3px] shrink-0 ${
                                msg.agent === 'build' ? 'bg-[#fab283]' : 'bg-[#5c9cf5]'
                              }`}
                            />
                            <div className="flex-1 px-4 py-3 space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-[#808080] tabular-nums">
                                <span>
                                  you ·{' '}
                                  <span
                                    className={
                                      msg.agent === 'build' ? 'text-[#fab283]' : 'text-[#5c9cf5]'
                                    }
                                  >
                                    {msg.agent}
                                  </span>{' '}
                                  · {msg.model}
                                </span>
                                <span>
                                  {new Date(msg.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </span>
                              </div>
                              <div className="text-sm text-[#eeeeee] whitespace-pre-wrap break-words leading-relaxed">
                                {msg.content}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className="space-y-3 pl-2">
                          {/* Collapsible TUI Thinking Trace */}
                          {hasReasoning && (
                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedReasoning((prev) => ({
                                    ...prev,
                                    [msg.id]: !prev[msg.id]
                                  }))
                                }
                                className="flex items-center gap-1.5 text-xs text-[#808080] hover:text-[#eeeeee] transition-colors"
                              >
                                {isReasoningOpen ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                                <span className="italic">
                                  Thinking ({msg.reasoning?.length.toLocaleString()} chars)
                                </span>
                              </button>
                              {isReasoningOpen && (
                                <div className="mt-2 p-3 bg-[#111111] border border-[#1f1f1f] text-xs text-[#808080] italic whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                  {msg.reasoning}
                                </div>
                              )}
                            </div>
                          )}

                          {/* TUI Tool Execution Rows */}
                          {msg.tools && msg.tools.length > 0 && (
                            <div className="space-y-1.5">
                              {msg.tools.map((tl) => (
                                <div
                                  key={tl.id}
                                  className="px-3 py-2 bg-[#141414] border border-[#1f1f1f] text-xs flex items-center justify-between gap-4"
                                >
                                  <div className="truncate text-[#eeeeee]">
                                    <span className="text-[#fab283] font-semibold">
                                      → {tl.name}
                                    </span>
                                    {tl.title ? (
                                      <span className="text-[#808080]"> · {tl.title}</span>
                                    ) : tl.input ? (
                                      <span className="text-[#808080]">
                                        {' '}
                                        · {JSON.stringify(tl.input).slice(0, 80)}
                                      </span>
                                    ) : null}
                                  </div>
                                  <span
                                    className={`text-[11px] shrink-0 ${
                                      tl.status === 'error'
                                        ? 'text-[#e06c75]'
                                        : tl.status === 'done'
                                        ? 'text-[#7fd88f]'
                                        : 'text-[#fab283]'
                                    }`}
                                  >
                                    {tl.status === 'running'
                                      ? 'running…'
                                      : tl.status === 'error'
                                      ? 'failed'
                                      : 'done'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Assistant Markdown Output */}
                          {msg.content ? (
                            <div className="text-[#eeeeee]">
                              <MarkdownRenderer content={msg.content} />
                            </div>
                          ) : !msg.error ? (
                            <div className="py-1 text-xs text-[#808080]">
                              <span className="text-[#fab283]">[⋯]</span> {msg.agent} · {msg.model}{' '}
                              generating…
                            </div>
                          ) : null}

                          {/* Error Banner */}
                          {msg.error && (
                            <div className="p-3 bg-[#1f1214] border border-[#e06c75]/40 text-xs text-[#e06c75] flex items-center justify-between gap-4">
                              <span>Error: {msg.error}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const lastUser = [...activeThread.messages]
                                    .reverse()
                                    .find((m) => m.role === 'user');
                                  if (lastUser) handleSendMessage(lastUser.content);
                                }}
                                className="px-2.5 py-1 bg-[#e06c75] text-[#0a0a0a] font-semibold whitespace-nowrap shrink-0"
                              >
                                Retry
                              </button>
                            </div>
                          )}

                          {/* OpenCode TUI Step Completion Footer */}
                          {(msg.durationMs !== undefined || msg.tokens) && (
                            <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-[#808080] tabular-nums">
                              <span
                                className={
                                  msg.agent === 'build' ? 'text-[#fab283]' : 'text-[#5c9cf5]'
                                }
                              >
                                ▣
                              </span>
                              <span className="text-[#eeeeee] capitalize">{msg.agent}</span>
                              <span aria-hidden="true">·</span>
                              <span>{msg.model.replace('opencode/', '')}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#fab283]/80">opaslabs</span>
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
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Bottom Docked OpenCode Prompt Box */}
                <div className="border-t border-[#1e1e1e] bg-[#0a0a0a] px-4 md:px-8 py-4">
                  {renderOpenCodePromptBox(false)}
                </div>
              </>
            )}
          </div>
        )}

        {/* VIEW 2: SANDBOX FILES INSPECTOR */}
        {activeNav === 'files' && (
          <div className="flex-1 flex flex-col p-6 md:p-8 overflow-y-auto">
            <div className="max-w-5xl w-full mx-auto space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1e1e1e] pb-4">
                <div>
                  <h2 className="text-base font-bold text-[#eeeeee]">
                    <span className="text-[#fab283]">opaslabs</span> / workspace files
                  </h2>
                  <p className="text-xs text-[#808080] mt-1">
                    Inspect files created, modified, or executed by the OpenCode Build agent in /tmp/opencode-workspace.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchWorkspaceFiles(selectedFilePath)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#eeeeee] bg-[#141414] hover:bg-[#1e1e1e] border border-[#2a2a2a] transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                    <span>refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveNav('workspace')}
                    className="px-3 py-1.5 text-xs text-[#0a0a0a] font-semibold bg-[#fab283] hover:bg-[#ffc49b] transition-colors whitespace-nowrap shrink-0"
                  >
                    back to tui
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border border-[#1e1e1e] bg-[#141414] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#1e1e1e] text-xs font-semibold text-[#eeeeee] flex items-center justify-between">
                    <span>files</span>
                    <span className="text-[#808080] tabular-nums">{workspaceFiles.length}</span>
                  </div>
                  <div className="divide-y divide-[#1e1e1e] max-h-[460px] overflow-y-auto">
                    {workspaceFiles.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => fetchWorkspaceFiles(f.path)}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors text-xs ${
                          selectedFilePath === f.path
                            ? 'bg-[#1e1e1e] text-[#fab283]'
                            : 'text-[#808080] hover:bg-[#1a1a1a] hover:text-[#eeeeee]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode className="w-3.5 h-3.5 text-[#fab283] shrink-0" />
                          <span className="truncate">{f.path}</span>
                        </div>
                        <span className="text-[11px] text-[#808080] tabular-nums shrink-0">
                          {f.size} B
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 border border-[#1e1e1e] bg-[#0f0f0f] flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-[#1e1e1e] bg-[#141414] flex items-center justify-between">
                    <span className="text-xs text-[#eeeeee]">{selectedFilePath}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedFileContent);
                        setCopiedFile(true);
                        setTimeout(() => setCopiedFile(false), 1800);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#eeeeee] bg-[#1e1e1e] hover:bg-[#2a2a2a] transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedFile ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#7fd88f]" />
                          <span>copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-xs text-[#eeeeee] overflow-x-auto leading-relaxed flex-1 min-h-[360px]">
                    <code>{selectedFileContent || '// Select a file to inspect'}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: FREE MODELS DIRECTORY */}
        {activeNav === 'models' && (
          <div className="flex-1 p-6 md:p-8 overflow-y-auto">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between border-b border-[#1e1e1e] pb-4">
                <div>
                  <h2 className="text-base font-bold text-[#eeeeee]">
                    <span className="text-[#fab283]">opaslabs</span> / opencode free zen models
                  </h2>
                  <p className="text-xs text-[#808080] mt-1">
                    Zero-cost OpenCode Zen models running natively on OpenCode v2.2.1 with no login.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNav('workspace')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] bg-[#fab283] hover:bg-[#ffc49b] transition-colors whitespace-nowrap shrink-0"
                >
                  back to tui
                </button>
              </div>

              <div className="border border-[#1e1e1e] overflow-hidden bg-[#141414]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e1e1e] text-xs text-[#808080] bg-[#0f0f0f]">
                      <th className="py-3 px-4">model</th>
                      <th className="py-3 px-4">provider id</th>
                      <th className="py-3 px-4 text-right">context</th>
                      <th className="py-3 px-4 text-right">output</th>
                      <th className="py-3 px-4">speed</th>
                      <th className="py-3 px-4 text-right">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e1e] text-xs">
                    {models.map((m) => {
                      const isCurrent = m.id === selectedModel.id;
                      return (
                        <tr key={m.id} className="hover:bg-[#1a1a1a] transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[#eeeeee]">{m.name}</div>
                            <div className="text-[11px] text-[#808080] mt-0.5">
                              {m.description}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-[#fab283]">{m.fullId}</td>
                          <td className="py-3.5 px-4 text-right text-[#eeeeee] tabular-nums">
                            {m.contextLimit.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#eeeeee] tabular-nums">
                            {m.outputLimit.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-[#808080] tabular-nums">
                            {m.speedLabel}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                handleModelChange(m.id);
                                setActiveNav('workspace');
                              }}
                              className={`px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                isCurrent
                                  ? 'bg-[#1e1e1e] text-[#7fd88f]'
                                  : 'bg-[#eeeeee] text-[#0a0a0a] hover:bg-white'
                              }`}
                            >
                              {isCurrent ? 'active' : 'use'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: SESSIONS LIST */}
        {activeNav === 'sessions' && (
          <div className="flex-1 p-6 md:p-8 overflow-y-auto">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between border-b border-[#1e1e1e] pb-4">
                <div>
                  <h2 className="text-base font-bold text-[#eeeeee]">
                    <span className="text-[#fab283]">opaslabs</span> / opencode sessions
                  </h2>
                  <p className="text-xs text-[#808080] mt-1">
                    Switch between saved OpenCode sessions or start a fresh session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleNewSession}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] bg-[#fab283] hover:bg-[#ffc49b] transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>new session</span>
                </button>
              </div>

              <div className="border border-[#1e1e1e] overflow-hidden bg-[#141414]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e1e1e] text-xs text-[#808080] bg-[#0f0f0f]">
                      <th className="py-3 px-4">title</th>
                      <th className="py-3 px-4">session id</th>
                      <th className="py-3 px-4">model</th>
                      <th className="py-3 px-4 text-right">messages</th>
                      <th className="py-3 px-4 text-right">updated</th>
                      <th className="py-3 px-4 text-right">actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e1e] text-xs">
                    {threads.map((t) => (
                      <tr key={t.id} className="hover:bg-[#1a1a1a] transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-[#eeeeee]">{t.title}</td>
                        <td className="py-3.5 px-4 text-[#808080]">
                          {t.opencodeSessionID || 'uninitialized'}
                        </td>
                        <td className="py-3.5 px-4 text-[#fab283]">opencode/{t.modelId}</td>
                        <td className="py-3.5 px-4 text-right text-[#eeeeee] tabular-nums">
                          {t.messages.length}
                        </td>
                        <td className="py-3.5 px-4 text-right text-[#808080] tabular-nums">
                          {new Date(t.updatedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveThreadId(t.id);
                              setActiveNav('workspace');
                            }}
                            className="px-3 py-1 text-xs bg-[#1e1e1e] hover:bg-[#2a2a2a] text-[#eeeeee] transition-colors whitespace-nowrap shrink-0"
                          >
                            open
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteThread(t.id, e)}
                            className="px-2.5 py-1 text-xs text-[#e06c75] hover:bg-[#1f1214] transition-colors whitespace-nowrap shrink-0"
                          >
                            delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Authentic OpenCode TUI `home.footer` (`Fl` component in binary) */}
      <footer className="px-4 py-1.5 bg-[#0a0a0a] border-t border-[#161616] flex items-center justify-between text-xs text-[#808080] select-none tabular-nums">
        <div className="flex items-center gap-4 truncate">
          <button
            type="button"
            onClick={() => setActiveNav(activeNav === 'models' ? 'workspace' : 'models')}
            className="flex items-center gap-1.5 hover:text-[#eeeeee] transition-colors"
          >
            <span className="text-[#7fd88f]">⊙</span>
            <span className="text-[#eeeeee]">{models.length} Zen</span>
            <span className="text-[#808080]">/models</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('files')}
            className="hidden sm:flex items-center gap-1.5 hover:text-[#eeeeee] transition-colors"
          >
            <span className="text-[#7fd88f]">⊙</span>
            <span className="text-[#eeeeee]">1 sandbox</span>
            <span className="text-[#808080]">/files</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[#fab283] font-semibold">opaslabs</span>
          <span aria-hidden="true">·</span>
          <span>v2.2.1</span>
        </div>
      </footer>

      {/* Authentic OpenCode TUI Dialog (`Select Model` / `ctrl+m`) */}
      {showModelModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowModelModal(false)}
        >
          <div
            className="w-full max-w-lg border border-[#3c3c3c] bg-[#141414] shadow-2xl overflow-hidden font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#262626] bg-[#1a1a1a]">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-[#eeeeee]">Models</span>
                <span className="text-[#808080]">· opaslabs opencode zen (free)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowModelModal(false)}
                className="text-xs text-[#808080] hover:text-[#eeeeee]"
              >
                esc
              </button>
            </div>
            <div className="p-2.5 border-b border-[#262626] bg-[#141414]">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a] border border-[#2a2a2a]">
                <Search className="w-3.5 h-3.5 text-[#808080]" />
                <input
                  type="text"
                  autoFocus
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models…"
                  className="w-full bg-transparent text-xs text-[#eeeeee] placeholder-[#808080] focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-[#1f1f1f]">
              {models
                .filter(
                  (m) =>
                    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                    m.id.toLowerCase().includes(modelSearch.toLowerCase())
                )
                .map((m) => {
                  const active = m.id === selectedModel.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelChange(m.id)}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors ${
                        active
                          ? 'bg-[#1e1e1e] text-[#fab283]'
                          : 'hover:bg-[#1a1a1a] text-[#eeeeee]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold flex items-center gap-2">
                          <span>{m.name}</span>
                          <span className="text-[#808080] font-normal">· {m.fullId}</span>
                        </div>
                        <div className="text-[11px] text-[#808080] mt-0.5">
                          {m.description}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-[#808080] tabular-nums shrink-0 ml-4">
                        <div>{(m.contextLimit / 1000).toFixed(0)}K ctx</div>
                        <div className="text-[#7fd88f]">Free</div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
