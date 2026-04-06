# Chrome Extension MCP Server Architecture Research

## 1. Chrome Manifest V3 Service Worker Lifecycle & WebSocket Keepalive

### Problem
MV3 service workers terminate after ~30s of inactivity. WebSockets cannot be held in service workers because they require persistent connections in an ephemeral runtime.

### Solutions

**Offscreen Documents (Preferred)**
- Create offscreen DOM via `chrome.offscreen` API (Chrome 109+)
- Offscreen docs have event-page-like lifetimes—persist while active
- Send heartbeat messages from offscreen doc to service worker every <30s to keep SW alive
- Pattern: Offscreen doc maintains WebSocket, SW handles MCP protocol

**Service Worker Keepalive Patterns**
- Active WebSocket connections now extend SW lifetime (Chrome 116+)
- Sending/receiving on WebSocket resets idle timer
- However, **native messaging (stdio) avoids this problem entirely**—no persistent connection needed

### Key Insight
For Chrome extension MCP servers, **native messaging is preferable to WebSockets** because stdio transport doesn't require persistent bidirectional connections.

---

## 2. Native Messaging Host Setup (Node.js + Chrome)

### Message Protocol
- **4-byte length prefix** (u32, native endianness) + UTF-8 JSON payload
- **Size limits**: 1 MB max response from host, 64 MiB max to host
- **Transport**: stdin/stdout only; Chrome spawns host process separately

### Windows-Specific Requirements
- Set I/O mode to **O_BINARY** (default is O_TEXT)
- Text mode corrupts framing: `\n` → `\r\n`
- Use `__setmode(fileno, O_BINARY)` in C/C++ or handle in wrapper scripts
- **Native messaging manifest location**: Registry key or manifest JSON file

### Manifest Registration (Windows)
```json
{
  "name": "com.example.chrome_native_bridge",
  "description": "Native bridge to MCP server",
  "path": "C:\\path\\to\\host.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```
- Manifest placed in: `HKEY_LOCAL_MACHINE\Software\Google\Chrome\NativeMessagingHosts\com.example.chrome_native_bridge`
- Or as file: `%APPDATA%\Google\Chrome\User Data\Default\Extensions\{id}\nm.json`

### Node.js Implementations
Available packages:
- `chrome-native-messaging` (Input/Output/Transform streams)
- `native-messaging` (simov/native-messaging on npm)
- `native-messaging-nodejs` (guest271314 example)

---

## 3. MCP SDK for Node.js Implementation Pattern

### Core Setup
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({
  name: "chrome-qa-server",
  version: "1.0.0"
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "run_qa_check",
      description: "Execute QA validation",
      inputSchema: { /* ... */ }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Handle tool execution
});

// Connect to stdio
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Critical Rule
**DO NOT write logs to stdout**—stdout carries JSON-RPC protocol. Use `stderr` or file logging.

---

## 4. Existing Chrome MCP Architecture: hangwin/mcp-chrome

### Three-Tier Design
1. **Chrome Extension** (MV3)
   - Handles Chrome API calls (tabs, navigation, etc.)
   - Receives messages via native messaging

2. **Native Bridge** (`mcp-chrome-bridge`)
   - Wrapper process that translates native messaging ↔ Node.js process
   - Reads/writes 4-byte framed JSON on stdin/stdout
   - Spawns Node.js MCP server as child process

3. **Node.js MCP Server**
   - Implements `@modelcontextprotocol/sdk`
   - Registers tools (tab control, navigate, execute scripts)
   - Communicates with bridge via stdio

### Transport Options
- **HTTP/Streamable**: Keep server accessible over HTTP endpoint
- **Stdio**: Local process spawned by client (e.g., Claude Desktop)

### Lessons Learned
- Wrapper script essential on Windows (handles binary mode, length framing)
- Native messaging manifest must be registered in registry or user profile
- Separation of concerns: extension ↔ bridge ↔ server allows independent scaling

---

## Technical Decision Summary

| Concern | Decision | Rationale |
|---------|----------|-----------|
| WebSocket vs Native Messaging | **Native Messaging (stdio)** | No 30s timeout, simpler protocol, native registry support |
| Service Worker Persistence | **Not needed with stdio** | Native messaging doesn't require persistent SW state |
| Offscreen Documents | **Optional heartbeat** | Use if HTTP streaming needed; unnecessary for stdio |
| Node.js SDK | **@modelcontextprotocol/sdk + StdioServerTransport** | Official, well-documented, maintained by Anthropic |
| Architecture Pattern | **3-tier (Extension ↔ Bridge ↔ MCP Server)** | Separation of concerns, proven by hangwin/mcp-chrome |
| Windows Specifics | **Registry manifest + binary mode wrapper** | Registry required for native host discovery |

---

## Implementation Sequence
1. Create native messaging manifest & register in Windows registry
2. Build wrapper script (C++/Node.js) to handle 4-byte framing + binary mode
3. Implement MCP server using `@modelcontextprotocol/sdk` with stdio transport
4. Create MV3 extension with native messaging sender
5. Test with Claude Desktop or MCP client

---

## Unresolved Questions
- How to handle long-running QA tasks without blocking stdio?
- Should MCP server spawn worker threads or child processes for heavy tasks?
- What's the latency profile for native messaging on Windows with large payloads?
