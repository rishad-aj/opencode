import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

interface ParsedBlock {
  type: 'code' | 'text';
  lang?: string;
  content: string;
}

function parseBlocks(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: markdown.slice(lastIndex, match.index)
      });
    }
    blocks.push({
      type: 'code',
      lang: match[1] || 'text',
      content: match[2].replace(/\n$/, '')
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < markdown.length) {
    const rest = markdown.slice(lastIndex);
    // Handle unclosed streaming code block
    const unclosedMatch = rest.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
    if (unclosedMatch && unclosedMatch.index !== undefined) {
      if (unclosedMatch.index > 0) {
        blocks.push({
          type: 'text',
          content: rest.slice(0, unclosedMatch.index)
        });
      }
      blocks.push({
        type: 'code',
        lang: unclosedMatch[1] || 'text',
        content: unclosedMatch[2]
      });
    } else {
      blocks.push({
        type: 'text',
        content: rest
      });
    }
  }

  return blocks;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[13px] bg-slate-800/90 text-sky-300 px-1.5 py-0.5 rounded border border-slate-700/70"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-3 rounded-lg border border-slate-800 bg-[#070A10] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800/80 bg-slate-900/60">
        <span className="font-mono text-xs text-slate-400">
          {lang || 'code'} · {code.split('\n').length} lines
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded transition-colors whitespace-nowrap shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-[13px] leading-relaxed font-mono text-slate-200 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-200">
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          return <CodeBlock key={i} lang={block.lang || 'text'} code={block.content} />;
        }

        const paragraphs = block.content.split(/\n{2,}/);
        return (
          <React.Fragment key={i}>
            {paragraphs.map((para, pIdx) => {
              const trimmed = para.trim();
              if (!trimmed) return null;

              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={pIdx} className="text-base font-semibold text-white pt-2">
                    {renderInlineFormatting(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={pIdx} className="text-lg font-semibold text-white pt-2.5">
                    {renderInlineFormatting(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={pIdx} className="text-xl font-bold text-white pt-3">
                    {renderInlineFormatting(trimmed.slice(2))}
                  </h2>
                );
              }

              const lines = trimmed.split('\n');
              const isList = lines.every((l) => /^(\s*[-*]|\s*\d+\.)\s+/.test(l));
              if (isList) {
                return (
                  <ul key={pIdx} className="space-y-1.5 pl-4 list-disc marker:text-slate-500">
                    {lines.map((line, lIdx) => (
                      <li key={lIdx} className="text-slate-200">
                        {renderInlineFormatting(line.replace(/^(\s*[-*]|\s*\d+\.)\s+/, ''))}
                      </li>
                    ))}
                  </ul>
                );
              }

              return (
                <p key={pIdx} className="whitespace-pre-wrap break-words">
                  {renderInlineFormatting(para)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
