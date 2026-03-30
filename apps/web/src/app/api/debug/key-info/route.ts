// TEMPORARY DIAGNOSTIC — remove after P11.1-a is complete
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-buildos-secret");
  const internalSecret = process.env.BUILDOS_INTERNAL_SECRET;
  const legacySecret = process.env.BUILDOS_SECRET;
  if (secret !== internalSecret && secret !== legacySecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  const normalized = raw.replace(/\\n/g, "\n").trim();

  function safeFirst20(s: string): string {
    return s.slice(0, 20).split("").map(c => {
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      const code = c.charCodeAt(0);
      if (code < 32) return `[${code}]`;
      return c;
    }).join("");
  }

  const info = {
    rawLen: raw.length,
    normalizedLen: normalized.length,
    rawFirst20: safeFirst20(raw),
    normalizedFirst20: safeFirst20(normalized),
    hasBeginMarker: normalized.includes("-----BEGIN"),
    isRSA: normalized.includes("BEGIN RSA PRIVATE"),
    isPKCS8: normalized.includes("BEGIN PRIVATE KEY"),
    lineCount: normalized.split("\n").length,
    containsLiteralBackslashN: raw.includes("\\n"),
    appId: process.env.GITHUB_APP_ID ?? "(not set)",
    installationId: process.env.GITHUB_APP_INSTALLATION_ID ?? process.env.GITHUB_INSTALLATION_ID ?? "(not set)",
    org: process.env.GITHUB_ORG ?? process.env.GITHUB_REPO_OWNER ?? "(not set)",
  };

  return NextResponse.json(info);
}
