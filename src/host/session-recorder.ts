/**
 * Session recorder: captures every MCP tool call + result as structured transcript.
 * Classifies each step as pass/fail with evidence for test reports.
 */

export type StepStatus = 'pass' | 'fail' | 'error';

export interface SessionEntry {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  status: StepStatus;
  evidence: string;
  durationMs: number;
  timestamp: string;
  url?: string;
}

export interface TestReport {
  name: string;
  status: 'PASSED' | 'FAILED';
  totalSteps: number;
  passed: number;
  failed: number;
  durationMs: number;
  steps: SessionEntry[];
  summary: string; // markdown table
}

/** Tools whose results contain { pass: boolean } */
const ASSERT_TOOLS = new Set([
  'assert_visible', 'assert_text', 'assert_url', 'assert_network', 'assert_count',
]);
const WAIT_TOOLS = new Set(['wait_for', 'wait_for_network']);

export class SessionRecorder {
  private entries: SessionEntry[] = [];
  private currentUrl = '';
  private testName = 'Unnamed Test';
  private testStartTime = 0;
  private pendingTool: string | null = null;
  private pendingArgs: Record<string, unknown> = {};
  private pendingStart = 0;

  /** Start a named test session (clears previous). */
  startTest(name: string): void {
    this.entries = [];
    this.testName = name;
    this.testStartTime = Date.now();
    this.currentUrl = '';
    this.pendingTool = null;
  }

  /** Record the start of a tool call. */
  recordCall(tool: string, args: Record<string, unknown>): void {
    if (!this.testStartTime) this.testStartTime = Date.now();
    this.pendingTool = tool;
    this.pendingArgs = args || {};
    this.pendingStart = Date.now();

    if (tool === 'navigate' && typeof args.url === 'string') {
      this.currentUrl = args.url;
    }
  }

  /** Record the result of the pending tool call. */
  recordResult(result: unknown): void {
    if (!this.pendingTool) return;

    if (this.pendingTool === 'get_url' && typeof result === 'object' && result !== null) {
      const r = result as { url?: string };
      if (r.url) this.currentUrl = r.url;
    }

    const { status, evidence } = this.classifyResult(this.pendingTool, result);

    this.entries.push({
      step: this.entries.length + 1,
      tool: this.pendingTool,
      args: this.pendingArgs,
      result: this.summarizeResult(result),
      status,
      evidence,
      durationMs: Date.now() - this.pendingStart,
      timestamp: new Date().toISOString(),
      url: this.currentUrl || undefined,
    });

    this.pendingTool = null;
  }

  /** Record a failed tool call (exception thrown). */
  recordError(errorMessage: string): void {
    if (!this.pendingTool) return;
    this.entries.push({
      step: this.entries.length + 1,
      tool: this.pendingTool,
      args: this.pendingArgs,
      result: null,
      status: 'error',
      evidence: errorMessage.substring(0, 150),
      durationMs: Date.now() - this.pendingStart,
      timestamp: new Date().toISOString(),
      url: this.currentUrl || undefined,
    });
    this.pendingTool = null;
  }

  /** Classify result as pass/fail based on tool type. */
  private classifyResult(tool: string, result: unknown): { status: StepStatus; evidence: string } {
    const r = result as Record<string, unknown> | null;

    // Assertion tools: check { pass: boolean, message: string }
    if (ASSERT_TOOLS.has(tool)) {
      const pass = r?.pass === true;
      const msg = (typeof r?.message === 'string' ? r.message : JSON.stringify(r)).substring(0, 150);
      return { status: pass ? 'pass' : 'fail', evidence: msg };
    }

    // Wait tools: check { found: boolean }
    if (WAIT_TOOLS.has(tool)) {
      const found = r?.found === true;
      const msg = (typeof r?.message === 'string' ? r.message : found ? 'Found' : 'Timeout').substring(0, 150);
      return { status: found ? 'pass' : 'fail', evidence: msg };
    }

    // select_option: check { success: boolean }
    if (tool === 'select_option') {
      const success = r?.success === true;
      return { status: success ? 'pass' : 'fail', evidence: success ? `Selected ${r?.selectedValue}` : 'Selection failed' };
    }

    // Interaction tools: pass if no error
    if (typeof result === 'string') {
      return { status: 'pass', evidence: result.substring(0, 150) };
    }
    if (r?.text) return { status: 'pass', evidence: String(r.text).substring(0, 150) };
    if (r?.url) return { status: 'pass', evidence: String(r.url).substring(0, 150) };
    if (r?.entries) return { status: 'pass', evidence: `${(r.entries as unknown[]).length} entries` };

    return { status: 'pass', evidence: 'OK' };
  }

  private summarizeResult(result: unknown): unknown {
    if (typeof result === 'string' && result.length > 500) {
      return result.substring(0, 500) + '... (truncated)';
    }
    return result;
  }

  /** Get the full session transcript. */
  getTranscript(): { name: string; entries: SessionEntry[]; entryCount: number; currentUrl: string } {
    return {
      name: this.testName,
      entries: this.entries,
      entryCount: this.entries.length,
      currentUrl: this.currentUrl,
    };
  }

  /** Generate a structured test report with markdown summary. */
  getReport(): TestReport {
    const passed = this.entries.filter(e => e.status === 'pass').length;
    const failed = this.entries.length - passed;
    const totalDuration = Date.now() - (this.testStartTime || Date.now());

    // Build markdown table
    const header = '| # | Tool | Args | Status | Evidence |';
    const divider = '|---|------|------|--------|----------|';
    const rows = this.entries.map(e => {
      const argsStr = Object.entries(e.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ').substring(0, 60);
      const icon = e.status === 'pass' ? 'PASS' : e.status === 'fail' ? 'FAIL' : 'ERR';
      return `| ${e.step} | ${e.tool} | ${argsStr} | ${icon} | ${e.evidence} |`;
    });

    const summary = [
      `## Test Report: ${this.testName}`,
      `**Status:** ${failed === 0 ? 'PASSED' : 'FAILED'} (${passed}/${this.entries.length} steps)`,
      `**Duration:** ${(totalDuration / 1000).toFixed(1)}s`,
      '',
      header,
      divider,
      ...rows,
    ].join('\n');

    return {
      name: this.testName,
      status: failed === 0 ? 'PASSED' : 'FAILED',
      totalSteps: this.entries.length,
      passed,
      failed,
      durationMs: totalDuration,
      steps: this.entries,
      summary,
    };
  }

  /** Clear the transcript for a new session. */
  clear(): void {
    this.entries = [];
    this.currentUrl = '';
    this.testName = 'Unnamed Test';
    this.testStartTime = 0;
    this.pendingTool = null;
  }
}
