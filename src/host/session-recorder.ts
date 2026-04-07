/**
 * Session recorder: captures every MCP tool call + result as structured transcript.
 * Used for test generation — Claude reads the transcript and produces .spec.ts.
 */

export interface SessionEntry {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  timestamp: string;
  url?: string;
}

export class SessionRecorder {
  private entries: SessionEntry[] = [];
  private currentUrl = '';
  private pendingTool: string | null = null;
  private pendingArgs: Record<string, unknown> = {};
  private pendingStart = 0;

  /** Record the start of a tool call. */
  recordCall(tool: string, args: Record<string, unknown>): void {
    this.pendingTool = tool;
    this.pendingArgs = args || {};
    this.pendingStart = Date.now();

    // Track URL from navigate calls
    if (tool === 'navigate' && typeof args.url === 'string') {
      this.currentUrl = args.url;
    }
  }

  /** Record the result of the pending tool call. */
  recordResult(result: unknown): void {
    if (!this.pendingTool) return;

    // Update URL from get_url results
    if (this.pendingTool === 'get_url' && typeof result === 'object' && result !== null) {
      const r = result as { url?: string };
      if (r.url) this.currentUrl = r.url;
    }

    this.entries.push({
      tool: this.pendingTool,
      args: this.pendingArgs,
      result: this.summarizeResult(result),
      durationMs: Date.now() - this.pendingStart,
      timestamp: new Date().toISOString(),
      url: this.currentUrl || undefined,
    });

    this.pendingTool = null;
  }

  /** Truncate large results to prevent bloated transcripts. */
  private summarizeResult(result: unknown): unknown {
    if (typeof result === 'string' && result.length > 500) {
      return result.substring(0, 500) + '... (truncated)';
    }
    return result;
  }

  /** Get the full session transcript. */
  getTranscript(): { entries: SessionEntry[]; entryCount: number; currentUrl: string } {
    return {
      entries: this.entries,
      entryCount: this.entries.length,
      currentUrl: this.currentUrl,
    };
  }

  /** Clear the transcript for a new session. */
  clear(): void {
    this.entries = [];
    this.currentUrl = '';
    this.pendingTool = null;
  }
}
