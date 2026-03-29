'use client'

import React from 'react'

interface Props {
  content: string
  className?: string
}

// ── Inline parser ──────────────────────────────────────────────────────────────
function parseInline(text: string, key?: string | number): React.ReactNode {
  if (!text) return null
  const segments: React.ReactNode[] = []
  // Patterns: **bold**, *italic*, `code`, [text](url)
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push(text.slice(last, m.index))
    if (m[2] !== undefined)      segments.push(<strong key={m.index}>{m[2]}</strong>)
    else if (m[3] !== undefined) segments.push(<em key={m.index}>{m[3]}</em>)
    else if (m[4] !== undefined) segments.push(<code key={m.index} className="bg-slate-100 text-rose-600 px-1 py-0.5 rounded text-[0.85em] font-mono">{m[4]}</code>)
    else if (m[5] !== undefined) segments.push(<a key={m.index} href={m[6]} target="_blank" rel="noreferrer" className="text-brand-600 underline hover:text-brand-700">{m[5]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push(text.slice(last))

  return segments.length === 1 ? segments[0] : <React.Fragment key={key}>{segments}</React.Fragment>
}

// ── Block parser ───────────────────────────────────────────────────────────────
function parseBlocks(raw: string): React.ReactNode[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // consume closing ```
      nodes.push(
        <div key={`cb-${i}`} className="my-4 rounded-lg overflow-hidden border border-slate-200">
          {lang && (
            <div className="bg-slate-700 text-slate-300 text-[10px] font-mono px-3 py-1.5 uppercase tracking-wide">
              {lang}
            </div>
          )}
          <pre className="bg-slate-800 text-slate-100 text-xs font-mono p-4 overflow-x-auto leading-relaxed">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text  = headingMatch[2]
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      const sizeMap: Record<number, string> = {
        1: 'text-2xl font-bold text-slate-900 mt-8 mb-3 pb-2 border-b border-slate-200',
        2: 'text-xl font-semibold text-slate-800 mt-6 mb-2',
        3: 'text-base font-semibold text-slate-800 mt-5 mb-1.5',
        4: 'text-sm font-semibold text-slate-700 mt-4 mb-1',
        5: 'text-sm font-medium text-slate-700 mt-3 mb-1',
        6: 'text-xs font-medium text-slate-600 mt-3 mb-1',
      }
      nodes.push(<Tag key={`h-${i}`} className={sizeMap[level] || ''}>{parseInline(text)}</Tag>)
      i++
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={`hr-${i}`} className="my-6 border-slate-200" />)
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <blockquote key={`bq-${i}`} className="my-3 border-l-4 border-brand-300 pl-4 text-slate-600 italic">
          {quoteLines.map((l, j) => <p key={j}>{parseInline(l)}</p>)}
        </blockquote>
      )
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ''))
        i++
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-3 ml-5 space-y-1 list-disc marker:text-slate-400">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-slate-700 leading-relaxed">{parseInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-3 ml-5 space-y-1 list-decimal marker:text-slate-500">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-slate-700 leading-relaxed">{parseInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Table (basic: | col | col |)
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      // Filter out separator rows (|---|---|)
      const [headerRow, , ...dataRows] = tableLines
      const headers = headerRow.split('|').filter(Boolean).map(h => h.trim())
      const rows = dataRows
        .filter(r => !/^\|[-:| ]+\|$/.test(r.trim()))
        .map(r => r.split('|').filter(Boolean).map(c => c.trim()))
      nodes.push(
        <div key={`tbl-${i}`} className="my-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {headers.map((h, j) => (
                  <th key={j} className="px-3 py-2 text-left font-semibold text-slate-700">{parseInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-slate-600 border-t border-slate-100">{parseInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph — collect until blank line or special start
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !lines[i].startsWith('|')
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={`p-${i}`} className="text-sm text-slate-700 leading-relaxed my-3">
          {parseInline(paraLines.join(' '))}
        </p>
      )
    }
  }

  return nodes
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function MarkdownRenderer({ content, className = '' }: Props) {
  if (!content?.trim()) {
    return (
      <p className={`text-sm text-slate-400 italic ${className}`}>No content yet.</p>
    )
  }

  return (
    <div className={`min-w-0 ${className}`}>
      {parseBlocks(content)}
    </div>
  )
}
