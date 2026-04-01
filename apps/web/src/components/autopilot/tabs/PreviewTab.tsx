'use client'
// src/components/autopilot/tabs/PreviewTab.tsx

import React, { useState } from "react";
import { Monitor, Smartphone, Tablet, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_CONFIG: Record<Viewport, { label: string; width: string; Icon: React.FC<{ className?: string }> }> = {
  desktop: { label: "Desktop", width: "100%",   Icon: Monitor    },
  tablet:  { label: "Tablet",  width: "768px",  Icon: Tablet     },
  mobile:  { label: "Mobile",  width: "390px",  Icon: Smartphone },
};

export const PreviewTab: React.FC = () => {
  const [viewport, setViewport]   = useState<Viewport>("desktop");
  const [key, setKey]             = useState(0);                    // force iframe refresh
  const [isLoading, setIsLoading] = useState(false);

  const previewUrl = process.env.NEXT_PUBLIC_PREVIEW_URL ?? "/";

  const handleRefresh = () => {
    setIsLoading(true);
    setKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 shrink-0">
        {/* Viewport toggles */}
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-background">
          {(Object.entries(VIEWPORT_CONFIG) as [Viewport, typeof VIEWPORT_CONFIG[Viewport]][]).map(
            ([id, { label, Icon }]) => (
              <button
                key={id}
                title={label}
                onClick={() => setViewport(id)}
                className={cn(
                  "p-1 rounded transition-colors",
                  viewport === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>

        {/* URL pill */}
        <div className="flex-1 flex items-center gap-1.5 bg-background border border-border rounded-md px-2 py-1 text-xs text-muted-foreground overflow-hidden">
          <span className="truncate">{previewUrl}</span>
        </div>

        {/* Actions */}
        <button
          title="Refresh preview"
          onClick={handleRefresh}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </button>

        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Iframe container */}
      <div className="flex-1 overflow-auto bg-muted/10 flex items-start justify-center py-2">
        <div
          className="relative transition-all duration-300 h-full rounded-md overflow-hidden border border-border shadow-sm bg-white"
          style={{ width: VIEWPORT_CONFIG[viewport].width, minHeight: "100%" }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <iframe
            key={key}
            src={previewUrl}
            title="App preview"
            className="w-full h-full border-0"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </div>
    </div>
  );
};