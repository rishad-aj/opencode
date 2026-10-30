import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

type Block =
  | { type: 'code'; lang: string; code: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'hr' }
  | { type: 'table'; rows: string[][] };

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*\*[^*\n]+\*\*\*)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(\[[^\]]+\]\([^)]+\))/g;

function renderInline(
  text: string,
  keyPrefix: string,
  variant: 'terminal' | 'ios'
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className={
            variant === 'ios'
              ? 'rounded-[5px] bg-[var(--im-inline-code)] px-1.5 py-[1px] font-mono text-[0.86em] break-all'
              : 'rounded bg-[var(--oc-elevated)] border border-[color:var(--oc-border)] px-1.5 py-0.5 font-mono text-[0.88em] text-[var(--oc-build)]'
          }
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('***')) {
      nodes.push(
        <strong key={key} className="font-semibold italic">
          {token.slice(3, -3)}
        </strong>
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong
          key={key}
          className={variant === 'ios' ? 'font-semibold' : 'font-semibold text-[var(--oc-fg)]'}
        >
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('~~')) {
      nodes.push(
        <del key={key} className="opacity-70 line-through">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noreferrer noopener"
            className={
              variant === 'ios'
                ? 'text-[var(--im-link)] underline decoration-current/40 underline-offset-2 hover:opacity-80'
                : 'text-[var(--oc-plan)] underline decoration-[var(--oc-plan)]/40 underline-offset-2 hover:opacity-80'
            }
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (supports optional whitespace, language, and info strings; handles unclosed fences while streaming)
    const fence = /^\s*```([^\n`]*)$/.exec(line);
    if (fence) {
      const rawLang = (fence[1] || '').trim().split(/\s+/)[0] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i++]);
      }
      if (i < lines.length) i++; // consume closing fence if present
      blocks.push({ type: 'code', lang: rawLang, code: buf.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: buf });
      continue;
    }

    // Markdown table
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const rows: string[][] = [];
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      rows.push(cells(line));
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(cells(lines[i++]));
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const ordered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || ordered.test(line)) {
      const isOrdered = ordered.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (isOrdered ? ordered.test(lines[i]) : bullet.test(lines[i]))
      ) {
        items.push(lines[i].replace(isOrdered ? ordered : bullet, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: isOrdered, items });
      continue;
    }

    // Paragraph: preserve line breaks inside the paragraph block
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*(#{1,6})\s/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !(/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || ''))
    ) {
      buf.push(lines[i++]);
    }
    blocks.push({ type: 'paragraph', lines: buf });
  }

  return blocks;
}

function CodeBlock({
  code,
  lang,
  variant
}: {
  code: string;
  lang: string;
  variant: 'terminal' | 'ios';
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (variant === 'ios') {
    return (
      <div className="my-2 min-w-0 max-w-full overflow-hidden rounded-[14px] bg-[var(--im-code-bg)] ring-1 ring-[color:var(--im-sep)]">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <span className="font-mono text-[11px] lowercase text-white/55">{lang || 'code'}</span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? (
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
        <pre className="max-w-full overflow-x-auto px-3 py-2.5">
          <code className="font-mono text-[12.5px] leading-relaxed text-[var(--im-code-fg)]">
            {code}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-2.5 min-w-0 max-w-full overflow-hidden rounded border border-[color:var(--oc-border)] bg-[var(--oc-code-bg)]">
      <div className="flex items-center justify-between border-b border-[color:var(--oc-border)] bg-[var(--oc-panel)] px-3 py-1.5 text-[11px] text-[var(--oc-fg-muted)]">
        <div className="flex items-center gap-1.5 font-mono">
          <Terminal className="h-3 w-3 text-[var(--oc-build)]" />
          <span>{lang || 'text'}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-[var(--oc-fg-muted)] transition-colors hover:bg-[var(--oc-elevated)] hover:text-[var(--oc-fg)]"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-[var(--oc-green)]" />
              <span className="text-[var(--oc-green)]">copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3">
        <code className="font-mono text-[12.5px] leading-relaxed text-[var(--oc-fg)]">{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  variant = 'terminal'
}: {
  content: string;
  variant?: 'terminal' | 'ios';
}) {
  const blocks = parseMarkdown(content);

  if (variant === 'ios') {
    return (
      <div className="im-md min-w-0 max-w-full space-y-2 text-[15.5px] leading-[1.42] break-words">
        {blocks.map((block, idx) => {
          const key = `b${idx}`;

          switch (block.type) {
            case 'code':
              return <CodeBlock key={key} code={block.code} lang={block.lang} variant="ios" />;

            case 'heading': {
              const size =
                block.level === 1
                  ? 'text-[18px] font-semibold'
                  : block.level === 2
                    ? 'text-[16.5px] font-semibold'
                    : 'text-[15.5px] font-semibold';
              return (
                <p key={key} className={`${size} ${idx === 0 ? '' : 'pt-1'}`}>
                  {renderInline(block.text, key, 'ios')}
                </p>
              );
            }

            case 'list':
              return block.ordered ? (
                <ol
                  key={key}
                  className="list-decimal space-y-1 pl-5 marker:text-[var(--im-label-2)]"
                >
                  {block.items.map((item, n) => (
                    <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`, 'ios')}</li>
                  ))}
                </ol>
              ) : (
                <ul key={key} className="list-disc space-y-1 pl-5 marker:text-[var(--im-label-2)]">
                  {block.items.map((item, n) => (
                    <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`, 'ios')}</li>
                  ))}
                </ul>
              );

            case 'quote':
              return (
                <blockquote
                  key={key}
                  className="border-l-[3px] border-[var(--im-label-3)] pl-3 text-[var(--im-label-2)]"
                >
                  {block.lines.map((ln, lIdx) => (
                    <React.Fragment key={`${key}-q${lIdx}`}>
                      {lIdx > 0 && <br />}
                      {renderInline(ln, `${key}-q${lIdx}`, 'ios')}
                    </React.Fragment>
                  ))}
                </blockquote>
              );

            case 'hr':
              return <hr key={key} className="my-2 border-[color:var(--im-sep)]" />;

            case 'table':
              return (
                <div
                  key={key}
                  className="my-2 max-w-full overflow-x-auto rounded-[12px] ring-1 ring-[color:var(--im-sep)]"
                >
                  <table className="w-full border-collapse text-left text-[13px]">
                    <tbody className="divide-y divide-[color:var(--im-sep)]">
                      {block.rows.map((row, r) => (
                        <tr
                          key={`${key}-r${r}`}
                          className={r === 0 ? 'bg-[var(--im-inline-code)]' : ''}
                        >
                          {row.map((cell, c) => (
                            <td
                              key={`${key}-r${r}c${c}`}
                              className={`px-2.5 py-1.5 align-top ${
                                r === 0 ? 'font-semibold' : 'opacity-85'
                              }`}
                            >
                              {renderInline(cell, `${key}-r${r}c${c}`, 'ios')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );

            case 'paragraph':
            default:
              return (
                <p key={key}>
                  {block.lines.map((ln, lIdx) => (
                    <React.Fragment key={`${key}-p${lIdx}`}>
                      {lIdx > 0 && <br />}
                      {renderInline(ln, `${key}-p${lIdx}`, 'ios')}
                    </React.Fragment>
                  ))}
                </p>
              );
          }
        })}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-2.5 font-mono text-[13.5px] leading-[1.6] text-[var(--oc-fg)] break-words">
      {blocks.map((block, idx) => {
        const key = `t${idx}`;

        switch (block.type) {
          case 'code':
            return <CodeBlock key={key} code={block.code} lang={block.lang} variant="terminal" />;

          case 'heading': {
            const size =
              block.level === 1
                ? 'text-[16px] font-semibold text-[var(--oc-build)]'
                : block.level === 2
                  ? 'text-[14.5px] font-semibold text-[var(--oc-fg)]'
                  : 'text-[13.5px] font-semibold text-[var(--oc-fg)]';
            return (
              <div key={key} className={`${size} ${idx === 0 ? '' : 'pt-1'}`}>
                <span className="mr-1.5 text-[var(--oc-fg-dim)]">
                  {'#'.repeat(Math.min(block.level, 3))}
                </span>
                {renderInline(block.text, key, 'terminal')}
              </div>
            );
          }

          case 'list':
            return block.ordered ? (
              <ol
                key={key}
                className="list-decimal space-y-1 pl-5 marker:text-[var(--oc-fg-muted)]"
              >
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`, 'terminal')}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="list-disc space-y-1 pl-5 marker:text-[var(--oc-build)]">
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`, 'terminal')}</li>
                ))}
              </ul>
            );

          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-2 border-[color:var(--oc-build)] pl-3 text-[var(--oc-fg-muted)] italic"
              >
                {block.lines.map((ln, lIdx) => (
                  <React.Fragment key={`${key}-q${lIdx}`}>
                    {lIdx > 0 && <br />}
                    {renderInline(ln, `${key}-q${lIdx}`, 'terminal')}
                  </React.Fragment>
                ))}
              </blockquote>
            );

          case 'hr':
            return <hr key={key} className="my-2.5 border-[color:var(--oc-border)]" />;

          case 'table':
            return (
              <div
                key={key}
                className="my-2.5 max-w-full overflow-x-auto rounded border border-[color:var(--oc-border)]"
              >
                <table className="w-full border-collapse text-left text-[12.5px]">
                  <tbody className="divide-y divide-[color:var(--oc-border)]">
                    {block.rows.map((row, r) => (
                      <tr
                        key={`${key}-r${r}`}
                        className={r === 0 ? 'bg-[var(--oc-panel)] text-[var(--oc-build)]' : ''}
                      >
                        {row.map((cell, c) => (
                          <td
                            key={`${key}-r${r}c${c}`}
                            className={`px-3 py-1.5 align-top ${
                              r === 0 ? 'font-semibold' : 'text-[var(--oc-fg)]'
                            }`}
                          >
                            {renderInline(cell, `${key}-r${r}c${c}`, 'terminal')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'paragraph':
          default:
            return (
              <p key={key}>
                {block.lines.map((ln, lIdx) => (
                  <React.Fragment key={`${key}-p${lIdx}`}>
                    {lIdx > 0 && <br />}
                    {renderInline(ln, `${key}-p${lIdx}`, 'terminal')}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

export default MarkdownRenderer;
