/**
 * Session recorder: captures every MCP tool call + result as structured transcript.
 * Classifies each step as pass/fail with evidence for test reports.
 *
 * Report format follows QA test case structure:
 *   Scenario | Pre-condition | Test Steps | Expected | Actual | Verdict
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

export interface TestCaseMetadata {
  description: string;
  precondition: string;
  steps: string;
  expected: string;
}

export interface TestReport {
  name: string;
  metadata: TestCaseMetadata;
  verdict: 'SUCCESS' | 'FAIL';
  actual: string;
  totalSteps: number;
  passed: number;
  failed: number;
  durationMs: number;
  steps: SessionEntry[];
  summary: string; // markdown report
}

/** Tools whose results contain { pass: boolean } */
const ASSERT_TOOLS = new Set([
  'assert_visible', 'assert_text', 'assert_url', 'assert_network', 'assert_count',
]);
const WAIT_TOOLS = new Set(['wait_for', 'wait_for_network']);

/** Tools that represent form-filling actions (grouped in compact summary). */
const FORM_FILL_TOOLS = new Set(['type', 'select_option', 'check', 'uncheck']);

export class SessionRecorder {
  private entries: SessionEntry[] = [];
  private currentUrl = '';
  private testName = 'Unnamed Test';
  private testStartTime = 0;
  private pendingTool: string | null = null;
  private pendingArgs: Record<string, unknown> = {};
  private pendingStart = 0;
  private metadata: TestCaseMetadata = { description: '', precondition: '', steps: '', expected: '' };

  /** Start a named test session (clears previous). */
  startTest(name: string, meta?: Partial<TestCaseMetadata>): void {
    this.entries = [];
    this.testName = name;
    this.testStartTime = Date.now();
    this.currentUrl = '';
    this.pendingTool = null;
    this.metadata = {
      description: meta?.description || '',
      precondition: meta?.precondition || '',
      steps: meta?.steps || '',
      expected: meta?.expected || '',
    };
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

  /** Describe a step in human-readable form. */
  private describeStep(e: SessionEntry): string {
    const a = e.args;
    switch (e.tool) {
      case 'navigate': return `Navigate to ${a.url}`;
      case 'click': return `Click ${a.role} "${a.name}"`;
      case 'type': return `Type "${String(a.text).substring(0, 30)}" into ${a.role} "${a.name}"`;
      case 'select_option': return `Select "${a.value || a.values}" in ${a.role} "${a.name}"`;
      case 'check': case 'uncheck': return `${e.tool} ${a.role} "${a.name}"`;
      case 'screenshot': return 'Take screenshot';
      case 'snapshot': return 'Take page snapshot';
      default:
        if (ASSERT_TOOLS.has(e.tool)) return `Assert: ${a.role ? `${a.role} "${a.name}"` : a.expected || a.pattern || a.url_pattern || e.tool}`;
        if (WAIT_TOOLS.has(e.tool)) return `Wait for ${a.role} "${a.name}"`;
        return `${e.tool}(${Object.values(a).map(v => JSON.stringify(v)).join(', ').substring(0, 40)})`;
    }
  }

  /** Group consecutive form-fill steps into compact phases. */
  private groupSteps(): Array<{ description: string; status: StepStatus; details: string[] }> {
    const groups: Array<{ description: string; status: StepStatus; details: string[] }> = [];
    let formBuffer: SessionEntry[] = [];

    const flushFormBuffer = () => {
      if (formBuffer.length === 0) return;
      if (formBuffer.length === 1) {
        const e = formBuffer[0];
        groups.push({ description: this.describeStep(e), status: e.status, details: [] });
      } else {
        const allPass = formBuffer.every(e => e.status === 'pass');
        const details = formBuffer.map(e => {
          const icon = e.status === 'pass' ? '✓' : '✗';
          return `${icon} ${this.describeStep(e)}`;
        });
        groups.push({
          description: `Fill ${formBuffer.length} form fields`,
          status: allPass ? 'pass' : 'fail',
          details,
        });
      }
      formBuffer = [];
    };

    for (const e of this.entries) {
      if (FORM_FILL_TOOLS.has(e.tool)) {
        formBuffer.push(e);
      } else {
        flushFormBuffer();
        groups.push({ description: this.describeStep(e), status: e.status, details: [] });
      }
    }
    flushFormBuffer();
    return groups;
  }

  /** Derive the "Actual" result from assertion evidence and step outcomes. */
  private deriveActual(): string {
    // Collect assertion results (most meaningful evidence)
    const assertions = this.entries.filter(e => ASSERT_TOOLS.has(e.tool) || WAIT_TOOLS.has(e.tool));
    if (assertions.length > 0) {
      const lastAssertion = assertions[assertions.length - 1];
      if (lastAssertion.status === 'pass') {
        return lastAssertion.evidence;
      }
      // On failure, collect all failed assertion evidence
      const failures = assertions.filter(a => a.status !== 'pass');
      return failures.map(f => f.evidence).join('; ');
    }

    // No assertions — summarize from last meaningful step
    const errors = this.entries.filter(e => e.status === 'fail' || e.status === 'error');
    if (errors.length > 0) {
      return errors.map(e => `${this.describeStep(e)}: ${e.evidence}`).join('; ');
    }

    return 'All steps completed successfully';
  }

  /** Generate a structured test report in QA test case format. */
  getReport(): TestReport {
    const passed = this.entries.filter(e => e.status === 'pass').length;
    const failed = this.entries.length - passed;
    const totalDuration = Date.now() - (this.testStartTime || Date.now());
    const verdict = failed === 0 ? 'SUCCESS' : 'FAIL';
    const actual = this.deriveActual();

    // Build compact grouped steps table
    const groups = this.groupSteps();
    const stepHeader = '| # | Step | Status |';
    const stepDivider = '|---|------|--------|';
    const stepRows: string[] = [];
    groups.forEach((g, i) => {
      const icon = g.status === 'pass' ? 'PASS' : g.status === 'fail' ? 'FAIL' : 'ERR';
      stepRows.push(`| ${i + 1} | ${g.description} | ${icon} |`);
      for (const d of g.details) {
        stepRows.push(`| | ${d} | |`);
      }
    });

    // Build QA test case summary (matches standard CSV: Title|Description|Precondition|Steps|Expected|Actual|Status)
    const lines: string[] = [
      `## Test Case: ${this.testName}`,
      '',
      '| Field | Detail |',
      '|-------|--------|',
      `| **Title** | ${this.testName} |`,
    ];
    if (this.metadata.description) {
      lines.push(`| **Description** | ${this.metadata.description} |`);
    }
    if (this.metadata.precondition) {
      lines.push(`| **Precondition** | ${this.metadata.precondition} |`);
    }
    if (this.metadata.steps) {
      lines.push(`| **Steps** | ${this.metadata.steps} |`);
    }
    if (this.metadata.expected) {
      lines.push(`| **Expected** | ${this.metadata.expected} |`);
    }
    lines.push(
      `| **Actual** | ${actual} |`,
      `| **Status** | ${verdict === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAIL'} |`,
      `| **Duration** | ${(totalDuration / 1000).toFixed(1)}s (${passed}/${this.entries.length} steps passed) |`,
    );

    // Append steps table
    lines.push('', '### Test Steps', '', stepHeader, stepDivider, ...stepRows);

    // If failed, append failure details
    if (failed > 0) {
      const failedSteps = this.entries.filter(e => e.status !== 'pass');
      lines.push('', '### Failures');
      for (const f of failedSteps) {
        lines.push(`- **Step ${f.step}** \`${f.tool}\`: ${f.evidence}`);
      }
    }

    const summary = lines.join('\n');

    return {
      name: this.testName,
      metadata: { ...this.metadata },
      verdict,
      actual,
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
    this.metadata = { description: '', precondition: '', steps: '', expected: '' };
  }
}
