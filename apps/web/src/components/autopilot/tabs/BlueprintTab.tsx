// src/components/autopilot/tabs/BlueprintTab.tsx

import React, { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────

interface BlueprintNode {
  id: string;
  name: string;
  type: "file" | "directory";
  language?: string;
  content?: string;
  children?: BlueprintNode[];
}

// ─── Mock Blueprint — replace with real data ──────────────────────────────

const MOCK_BLUEPRINT: BlueprintNode[] = [
  {
    id: "root-src",
    name: "src",
    type: "directory",
    children: [
      {
        id: "app",
        name: "app",
        type: "directory",
        children: [
          {
            id: "layout",
            name: "layout.tsx",
            type: "file",
            language: "tsx",
            content: `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`,
          },
          {
            id: "page",
            name: "page.tsx",
            type: "file",
            language: "tsx",
            content: `export default function HomePage() {
  return <main>Hello World</main>;
}`,
          },
        ],
      },
      {
        id: "components",
        name: "components",
        type: "directory",
        children: [
          {
            id: "ui",
            name: "ui",
            type: "directory",
            children: [
              { id: "button", name: "button.tsx", type: "file", language: "tsx", content: `// Button component` },
              { id: "card",   name: "card.tsx",   type: "file", language: "tsx", content: `// Card component`   },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pkg",
    name: "package.json",
    type: "file",
    language: "json",
    content: JSON.stringify({ name: "my-app", version: "0.1.0", dependencies: { next: "^14.0.0", react: "^18.0.0" } }, null, 2),
  },
  {
    id: "tsconfig",
    name: "tsconfig.json",
    type: "file",
    language: "json",
    content: JSON.stringify({ compilerOptions: { target: "ES2017", strict: true } }, null, 2),
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const BlueprintTab: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<BlueprintNode | null>(null);

  return (
    <div className="flex h-full divide-x divide-border">
      {/* File tree */}
      <div className="w-48 shrink-0 overflow-y-auto py-2">
        {MOCK_BLUEPRINT.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedNode?.id ?? null}
            onSelect={setSelectedNode}
          />
        ))}
      </div>

      {/* File content viewer */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedNode && selectedNode.type === "file" ? (
          <FileViewer node={selectedNode} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <FileCode className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm">Select a file to view its contents</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TreeNode ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: BlueprintNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: BlueprintNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, selectedId, onSelect }) => {
  const [open, setOpen] = useState(depth < 1);

  const isDir      = node.type === "directory";
  const isSelected = node.id === selectedId;

  const handleClick = () => {
    if (isDir) {
      setOpen((v) => !v);
    } else {
      onSelect(node);
    }
  };

  const Icon = isDir
    ? open
      ? FolderOpen
      : Folder
    : node.language === "json"
    ? FileJson
    : node.language?.startsWith("ts") || node.language?.startsWith("js")
    ? FileCode
    : File;

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-1.5 py-0.5 pr-2 text-xs rounded transition-colors",
          "hover:bg-muted/50",
          isSelected && "bg-primary/10 text-primary font-medium"
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isDir && (
          <ChevronRight
            className={cn("w-3 h-3 text-muted-foreground transition-transform shrink-0", open && "rotate-90")}
          />
        )}
        {!isDir && <span className="w-3 shrink-0" />}
        <Icon
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            isDir ? "text-yellow-500" : "text-blue-400"
          )}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && open && node.children?.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

// ─── FileViewer ───────────────────────────────────────────────────────────────

const FileViewer: React.FC<{ node: BlueprintNode }> = ({ node }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (node.content) {
      navigator.clipboard.writeText(node.content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10 shrink-0">
        <div className="flex items-center gap-1.5">
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{node.name}</span>
          {node.language && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              {node.language}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          title="Copy content"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
          ) : (
            <><Copy className="w-3 h-3" /><span>Copy</span></>
          )}
        </button>
      </div>

      {/* Code */}
      <div className="flex-1 overflow-auto">
        <pre className="p-3 text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {node.content ?? "// Empty file"}
        </pre>
      </div>
    </div>
  );
};