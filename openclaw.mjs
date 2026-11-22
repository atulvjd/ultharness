// OpenClaw remains the credential and tool-policy owner. This adapter exposes
// research and browser inspection; it does not expose shell or messaging tools.
export const OPENCLAW_TOOLS = ['web_search', 'web_fetch', 'memory_search', 'memory_get', 'browser'];
export function openClawSettings(body) {
  const url = new URL(body.url || 'http://127.0.0.1:18789');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Use the local OpenClaw gateway origin, for example http://127.0.0.1:18789');
  const tools = body.tools?.length ? body.tools : OPENCLAW_TOOLS;
  if (!Array.isArray(tools) || tools.some(name => !OPENCLAW_TOOLS.includes(name))) throw new Error(`OpenClaw supports these inspection tools: ${OPENCLAW_TOOLS.join(', ')}`);
  return { url: url.origin, tools: [...new Set(tools)] };
}
export function openClawArguments(tool, args = {}) {
  if (!OPENCLAW_TOOLS.includes(tool)) throw new Error('OpenClaw tool is not allowed');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool args must be an object');
  if (tool === 'browser') {
    if (!['status', 'tabs', 'open', 'navigate', 'snapshot', 'screenshot'].includes(args.action)) throw new Error('Browser supports status, tabs, open, navigate, snapshot and screenshot; interactions belong in project browser tests');
    // Always use the dedicated managed profile, never the signed-in personal browser.
    if (args.profile && args.profile !== 'openclaw') throw new Error('Use the dedicated openclaw browser profile');
    if (['open', 'navigate'].includes(args.action)) {
      const url = new URL(args.url || args.targetUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) browser URL without credentials');
    }
    // Only project known browser parameters; no arbitrary proxy/exec options.
    return Object.fromEntries(Object.entries({ action: args.action, profile: 'openclaw', targetId: args.targetId, targetUrl: args.targetUrl || args.url, fullPage: args.fullPage, format: args.format, snapshotFormat: args.snapshotFormat, compact: args.compact, depth: args.depth }).filter(([, value]) => value !== undefined));
  }
  return args;
}
export async function invokeOpenClaw(config, tool, args, env = process.env) {
  if (!config.tools.includes(tool)) throw new Error('This OpenClaw tool was not selected for the mission');
  const token = env.OPENCLAW_GATEWAY_TOKEN || env.OPENCLAW_GATEWAY_PASSWORD || '';
  const response = await fetch(`${config.url}/tools/invoke`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ tool, args: openClawArguments(tool, args) }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`OpenClaw HTTP ${response.status}: ${[401,403].includes(response.status) ? 'check gateway authentication and tool policy' : response.status === 404 ? 'tool unavailable or denied by gateway policy' : 'gateway request failed'}`); }
  let raw = ''; const decoder = new TextDecoder();
  for await (const chunk of response.body) { raw += decoder.decode(chunk, { stream: true }); if (raw.length > 2_000_000) throw new Error('OpenClaw result exceeds 2 MB'); }
  raw += decoder.decode();
  if (token) raw = raw.split(token).join('[gateway key redacted]');
  const data = JSON.parse(raw);
  if (data.ok !== true || !data.result) throw new Error('OpenClaw did not return a successful tool result');
  return data.result;
}
