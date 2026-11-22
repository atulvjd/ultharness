import { createInterface } from 'node:readline';
import { openClawSettings, invokeOpenClaw } from '../openclaw.mjs';
const config = openClawSettings({ url: process.argv[2], tools: JSON.parse(process.argv[3] || '[]') });
const reply = message => process.stdout.write(JSON.stringify(message) + '\n');
async function handle(request) {
  if (request.id === undefined) return;
  const base = { jsonrpc: '2.0', id: request.id };
  try {
    let result;
    if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ultharness-openclaw', version: '1.0.0' } };
    else if (request.method === 'ping') result = {};
    else if (request.method === 'tools/list') result = { tools: config.tools.map(name => ({ name, description: `OpenClaw ${name}. Pass native tool parameters inside args.${name === 'browser' ? ' Browser actions: status, tabs, open, navigate, snapshot, screenshot. Dedicated openclaw profile only. For interaction and responsive checks use project browser tests.' : ''}`, inputSchema: { type: 'object', properties: { args: { type: 'object', additionalProperties: true } }, required: ['args'], additionalProperties: false } })) };
    else if (request.method === 'tools/call') {
      try {
        const output = await invokeOpenClaw(config, request.params?.name, request.params?.arguments?.args);
        const content = Array.isArray(output.content) ? output.content.filter(item => (item.type === 'text' && typeof item.text === 'string') || (item.type === 'image' && typeof item.data === 'string' && /^image\//.test(item.mimeType || ''))) : [];
        result = { content: content.length ? content : [{ type: 'text', text: JSON.stringify(output) }], ...(output.isError === true ? { isError: true } : {}) };
        if (output.details) result.content.push({ type: 'text', text: JSON.stringify(output.details) });
      } catch (err) { result = { isError: true, content: [{ type: 'text', text: err.message }] }; }
    } else { reply({ ...base, error: { code: -32601, message: 'Method not found' } }); return; }
    reply({ ...base, result });
  } catch { reply({ ...base, error: { code: -32602, message: 'Invalid request' } }); }
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  if (line.length > 1_000_000) { process.stderr.write('MCP input limit exceeded\n'); process.exit(1); }
  try { void handle(JSON.parse(line)); } catch { reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
});
