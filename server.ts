import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = 3000;
const OPENCODE_PORT = 14090;
const OPENCODE_PASSWORD = crypto.randomBytes(24).toString('hex');
const OPENCODE_AUTH = 'Basic ' + Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString('base64');
const WORKSPACE_DIR = '/tmp/opencode-workspace';
const OPENCODE_BIN = path.resolve(process.cwd(), 'node_modules/@opencode/cli-linux-x64/bin/opencode');

export interface FreeModelMeta {
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

const FREE_OPENCODE_MODELS: FreeModelMeta[] = [
  {
    id: 'glm-5.3-flash-free',
    fullId: 'opencode/glm-5.3-flash-free',
    name: 'GLM-5.3 Flash Free',
    family: 'GLM Flash',
    contextLimit: 1000000,
    outputLimit: 131072,
    reasoning: true,
    speedLabel: '~1.4s latency',
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
    speedLabel: '~1.7s latency',
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
    speedLabel: '~2.1s latency',
    description: 'Balanced reasoning and code generation specialist with tool execution.'
  },
  {
    id: 'big-pickle',
    fullId: 'opencode/big-pickle',
    name: 'Big Pickle (OpenCode Flagship Free)',
    family: 'OpenCode Native',
    contextLimit: 200000,
    outputLimit: 65536,
    reasoning: true,
    speedLabel: '~3.8s latency',
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
    speedLabel: '~1.6s latency',
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
    speedLabel: '~1.9s latency',
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
    speedLabel: '~1.4s latency',
    description: 'Direct, non-thinking fast response model for instant answers and snippets.'
  }
];

async function ensureWorkspaceInitialized() {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  const readmePath = path.join(WORKSPACE_DIR, 'README.md');
  try {
    await fs.access(readmePath);
  } catch {
    await fs.writeFile(
      readmePath,
      `# OpenCode Sandbox Workspace\n\nThis directory (\`/tmp/opencode-workspace\`) is an isolated workspace managed by OpenCode v2.2.1.\n\n- Ask OpenCode in **Build** mode to create scripts, generate files, or run tests here.\n- Ask OpenCode in **Plan** mode for architectural answers, code reviews, or general chat without modifying files.\n`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(WORKSPACE_DIR, 'example.ts'),
      `// OpenCode Sandbox Starter File\nexport function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  let a = 0, b = 1;\n  for (let i = 2; i <= n; i++) {\n    const next = a + b;\n    a = b;\n    b = next;\n  }\n  return b;\n}\n`,
      'utf-8'
    );
  }
}

let opencodeProc: ChildProcess | null = null;
let daemonReady: Promise<void> | null = null;
let eventStreamActive = false;

type SessionListener = (event: { type: string; data: any; created?: string }) => void;
const sessionListeners = new Map<string, Set<SessionListener>>();

function emitToSession(sessionID: string, event: { type: string; data: any; created?: string }) {
  const set = sessionListeners.get(sessionID);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // ignore listener error
    }
  }
}

async function opencodeFetch(pathname: string, init: RequestInit = {}) {
  await startOpenCodeDaemon();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', OPENCODE_AUTH);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`http://127.0.0.1:${OPENCODE_PORT}${pathname}`, {
    ...init,
    headers
  });
}

async function connectDaemonEventBus() {
  if (eventStreamActive) return;
  eventStreamActive = true;

  while (opencodeProc !== null) {
    try {
      const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/api/event`, {
        headers: { Authorization: OPENCODE_AUTH }
      });
      if (!res.ok || !res.body) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const reader = res.body.getReader();
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
          const rawJson = trimmed.slice(5).trim();
          if (!rawJson) continue;
          try {
            const ev = JSON.parse(rawJson);
            // Auto-approve sandbox permissions so non-interactive web runs never block
            if (ev.type === 'permission.asked' && ev.data?.sessionID && ev.data?.id) {
              fetch(
                `http://127.0.0.1:${OPENCODE_PORT}/api/session/${ev.data.sessionID}/permission/${ev.data.id}/reply`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: OPENCODE_AUTH,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ decision: 'once' })
                }
              ).catch(() => {});
            }
            // Auto-cancel interactive CLI form prompts so model continues autonomously
            if (ev.type === 'form.created' && ev.data?.form?.sessionID && ev.data?.form?.id) {
              fetch(
                `http://127.0.0.1:${OPENCODE_PORT}/api/session/${ev.data.form.sessionID}/form/${ev.data.form.id}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: OPENCODE_AUTH }
                }
              ).catch(() => {});
            }

            const sid = ev.data?.sessionID;
            if (sid) {
              emitToSession(sid, ev);
            }
          } catch {
            // ignore malformed event line
          }
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  eventStreamActive = false;
}

function startOpenCodeDaemon(): Promise<void> {
  if (daemonReady) return daemonReady;

  daemonReady = new Promise<void>(async (resolve, reject) => {
    try {
      await ensureWorkspaceInitialized();
      // Strictly strip any non-OpenCode API keys so OpenCode only uses its own free Zen gateway
      const cleanEnv: NodeJS.ProcessEnv = {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: OPENCODE_PASSWORD,
        GEMINI_API_KEY: '',
        GOOGLE_API_KEY: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: ''
      };

      const proc = spawn(
        OPENCODE_BIN,
        ['serve', '--port', String(OPENCODE_PORT), '--hostname', '127.0.0.1'],
        {
          cwd: WORKSPACE_DIR,
          env: cleanEnv,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );

      opencodeProc = proc;
      let resolved = false;

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        if (!resolved && text.includes('listening on')) {
          resolved = true;
          connectDaemonEventBus();
          resolve();
        }
      };

      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);

      proc.on('exit', () => {
        opencodeProc = null;
        daemonReady = null;
        eventStreamActive = false;
        if (!resolved) {
          reject(new Error('OpenCode daemon exited before listening'));
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          connectDaemonEventBus();
          resolve();
        }
      }, 6000);
    } catch (err) {
      daemonReady = null;
      reject(err);
    }
  });

  return daemonReady;
}

async function listWorkspaceFiles(dir: string, baseDir = dir): Promise<Array<{ path: string; size: number; updatedAt: number }>> {
  const results: Array<{ path: string; size: number; updatedAt: number }> = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        const nested = await listWorkspaceFiles(fullPath, baseDir);
        results.push(...nested);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        results.push({
          path: relPath,
          size: stat.size,
          updatedAt: stat.mtimeMs
        });
      }
    }
  } catch {
    // ignore read errors
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function startServer() {
  const app = express();

  // Enable CORS so static github.io deployments can connect directly to this OpenCode gateway
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  // Warm up OpenCode daemon immediately on boot
  startOpenCodeDaemon().catch((err) => {
    console.error('Failed to pre-warm OpenCode daemon:', err);
  });

  // Health check endpoint for github.io remote gateway verification
  app.get('/api/health', async (_req, res) => {
    try {
      await startOpenCodeDaemon();
      res.json({
        ok: true,
        engine: 'OpenCode v2.2.1 Native Runtime',
        provider: 'opencode (OpenCode Zen Free Gateway)',
        modelsCount: FREE_OPENCODE_MODELS.length
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Daemon unavailable' });
    }
  });

  // 1. Get verified free OpenCode models + daemon info
  app.get('/api/models', async (_req, res) => {
    try {
      await startOpenCodeDaemon();
      res.json({
        engine: 'OpenCode v2.2.1 Native Runtime',
        provider: 'opencode (OpenCode Zen Free Gateway)',
        models: FREE_OPENCODE_MODELS
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to initialize OpenCode engine' });
    }
  });

  // 2. List or read files in the OpenCode Sandbox Workspace (/tmp/opencode-workspace)
  app.get('/api/workspace/files', async (_req, res) => {
    await ensureWorkspaceInitialized();
    const files = await listWorkspaceFiles(WORKSPACE_DIR);
    res.json({ directory: WORKSPACE_DIR, files });
  });

  app.get('/api/workspace/file', async (req, res) => {
    const rel = String(req.query.path || '');
    if (!rel || rel.includes('..')) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }
    const target = path.resolve(WORKSPACE_DIR, rel);
    if (!target.startsWith(WORKSPACE_DIR)) {
      res.status(400).json({ error: 'Access denied' });
      return;
    }
    try {
      const content = await fs.readFile(target, 'utf-8');
      res.json({ path: rel, content });
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // 3. Interrupt an active OpenCode session
  app.post('/api/chat/interrupt', async (req, res) => {
    const { sessionID } = req.body || {};
    if (!sessionID) {
      res.status(400).json({ error: 'Missing sessionID' });
      return;
    }
    try {
      await opencodeFetch(`/api/session/${encodeURIComponent(sessionID)}/interrupt`, {
        method: 'POST'
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to interrupt session' });
    }
  });

  // 4. Stream a chat/coding message through OpenCode v2.2.1 over SSE
  app.post('/api/chat/stream', async (req, res) => {
    const { message, modelId = 'glm-5.3-flash-free', sessionID: existingSessionID, agent = 'build' } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }

    // Validate model is one of OpenCode's free models
    const cleanModelId = String(modelId).replace(/^opencode\//, '');
    const validModel = FREE_OPENCODE_MODELS.find((m) => m.id === cleanModelId) || FREE_OPENCODE_MODELS[0];
    const cleanAgent = agent === 'plan' ? 'plan' : 'build';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, any>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await startOpenCodeDaemon();

      let activeSessionID = typeof existingSessionID === 'string' && existingSessionID.startsWith('ses_')
        ? existingSessionID
        : '';

      if (activeSessionID) {
        // Switch model on existing session
        const checkRes = await opencodeFetch(`/api/session/${encodeURIComponent(activeSessionID)}`);
        if (!checkRes.ok) {
          activeSessionID = '';
        } else {
          const currentSession = await checkRes.json().catch(() => null);
          await opencodeFetch(`/api/session/${encodeURIComponent(activeSessionID)}/model`, {
            method: 'POST',
            body: JSON.stringify({
              model: { providerID: 'opencode', id: validModel.id }
            })
          });
          if (currentSession?.data?.agent && currentSession.data.agent !== cleanAgent) {
            await opencodeFetch(`/api/session/${encodeURIComponent(activeSessionID)}/agent`, {
              method: 'POST',
              body: JSON.stringify({ agent: cleanAgent })
            });
          }
        }
      }

      if (!activeSessionID) {
        const createRes = await opencodeFetch('/api/session', {
          method: 'POST',
          body: JSON.stringify({
            agent: cleanAgent,
            model: { providerID: 'opencode', id: validModel.id },
            location: { directory: WORKSPACE_DIR }
          })
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Failed to create OpenCode session: ${errText}`);
        }
        const created = await createRes.json();
        activeSessionID = created.data.id;
      }

      sendEvent({
        type: 'session_init',
        sessionID: activeSessionID,
        model: validModel.fullId,
        agent: cleanAgent
      });

      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        const set = sessionListeners.get(activeSessionID);
        if (set) {
          set.delete(listener);
          if (set.size === 0) sessionListeners.delete(activeSessionID);
        }
        clearInterval(heartbeat);
        clearTimeout(safetyTimeout);
        if (!res.writableEnded) {
          res.end();
        }
      };

      const listener: SessionListener = (ev) => {
        if (finished) return;
        const t = ev.type;
        const d = ev.data || {};

        if (t === 'session.renamed' && d.title) {
          sendEvent({ type: 'session_title', title: d.title });
        } else if (t === 'session.step.started') {
          sendEvent({
            type: 'step_start',
            agent: d.agent || cleanAgent,
            model: d.model?.id ? `opencode/${d.model.id}` : validModel.fullId
          });
        } else if (t === 'session.reasoning.delta' && typeof d.delta === 'string') {
          sendEvent({ type: 'reasoning_delta', delta: d.delta });
        } else if (t === 'session.reasoning.ended' && typeof d.text === 'string') {
          sendEvent({ type: 'reasoning_done', text: d.text });
        } else if (t === 'session.text.delta' && typeof d.delta === 'string') {
          sendEvent({ type: 'text_delta', delta: d.delta });
        } else if (t === 'session.text.ended' && typeof d.text === 'string') {
          sendEvent({ type: 'text_done', text: d.text });
        } else if (t === 'session.tool.input.started') {
          sendEvent({
            type: 'tool_start',
            id: d.id,
            name: d.name
          });
        } else if (t === 'session.tool.called') {
          sendEvent({
            type: 'tool_call',
            id: d.id,
            input: d.input
          });
        } else if (t === 'session.tool.succeeded') {
          sendEvent({
            type: 'tool_result',
            id: d.id,
            title: d.title,
            metadata: d.metadata
          });
        } else if (t === 'session.tool.failed') {
          sendEvent({
            type: 'tool_error',
            id: d.id,
            error: d.error
          });
        } else if (t === 'session.usage.updated' && d.tokens) {
          sendEvent({
            type: 'usage',
            cost: d.cost ?? 0,
            tokens: d.tokens
          });
        } else if (t === 'session.execution.failed') {
          sendEvent({
            type: 'error',
            message: d.error?.message || 'OpenCode execution failed'
          });
          cleanup();
        } else if (t === 'session.execution.interrupted') {
          sendEvent({ type: 'done', interrupted: true });
          cleanup();
        } else if (t === 'session.execution.succeeded') {
          sendEvent({ type: 'done' });
          cleanup();
        }
      };

      if (!sessionListeners.has(activeSessionID)) {
        sessionListeners.set(activeSessionID, new Set());
      }
      sessionListeners.get(activeSessionID)!.add(listener);

      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 15000);

      const safetyTimeout = setTimeout(() => {
        sendEvent({ type: 'error', message: 'Request timed out after 120 seconds.' });
        cleanup();
      }, 120000);

      req.on('close', () => {
        cleanup();
      });

      const promptRes = await opencodeFetch(
        `/api/session/${encodeURIComponent(activeSessionID)}/prompt`,
        {
          method: 'POST',
          body: JSON.stringify({ text: message.trim() })
        }
      );

      if (!promptRes.ok) {
        const errText = await promptRes.text();
        sendEvent({
          type: 'error',
          message: `OpenCode prompt rejected (${promptRes.status}): ${errText}`
        });
        cleanup();
      }
    } catch (err: any) {
      sendEvent({
        type: 'error',
        message: err?.message || 'Unexpected error communicating with OpenCode runtime'
      });
      if (!res.writableEnded) res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenCode Web Workspace listening on http://localhost:${PORT}`);
  });
}

startServer();
