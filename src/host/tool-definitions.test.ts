import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from './tool-definitions.js';

describe('Tool definitions', () => {
  it('should have 24 tools total (6 core + 5 assert + 2 wait + 4 observe + 4 interact + 3 session)', () => {
    expect(ALL_TOOLS).toHaveLength(24);
  });

  it('should have unique tool names', () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should have valid inputSchema on all tools', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('should include all Phase 1 core tools', () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(names).toContain('navigate');
    expect(names).toContain('snapshot');
    expect(names).toContain('screenshot');
    expect(names).toContain('click');
    expect(names).toContain('type');
    expect(names).toContain('press_key');
  });

  it('should include all Phase 2 assertion tools', () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(names).toContain('assert_visible');
    expect(names).toContain('assert_text');
    expect(names).toContain('assert_url');
    expect(names).toContain('assert_network');
    expect(names).toContain('assert_count');
  });

  it('should include all Phase 2 wait tools', () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(names).toContain('wait_for');
    expect(names).toContain('wait_for_network');
  });

  it('should include all Phase 2 observation tools', () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(names).toContain('get_text');
    expect(names).toContain('get_url');
    expect(names).toContain('get_network_log');
    expect(names).toContain('get_console_log');
  });

  it('should have required fields on assertion tools', () => {
    const assertVisible = ALL_TOOLS.find(t => t.name === 'assert_visible');
    expect(assertVisible?.inputSchema.required).toContain('role');
    expect(assertVisible?.inputSchema.required).toContain('name');

    const assertText = ALL_TOOLS.find(t => t.name === 'assert_text');
    expect(assertText?.inputSchema.required).toContain('expected');

    const assertUrl = ALL_TOOLS.find(t => t.name === 'assert_url');
    expect(assertUrl?.inputSchema.required).toContain('pattern');
  });
});
