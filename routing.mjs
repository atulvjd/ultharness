const localHost = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
const invalid = message => Object.assign(new Error(message), { status: 400 });

export function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw invalid('Enter a valid model gateway URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw invalid('Use an HTTP(S) URL without credentials, query parameters, or a fragment');
  }
  if (url.protocol === 'http:' && !localHost(url.hostname)) throw invalid('Use HTTPS for a remote model gateway');
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/v1') ? pathname : `${pathname}/v1`;
  return url.toString().replace(/\/$/, '');
}

export function modelId(value) {
  const model = String(value ?? '').trim();
  if (model.length > 200 || /[\x00-\x1f\x7f]/.test(model)) throw invalid('Model ID is invalid');
  return model;
}

export async function discoverModels(baseUrl, apiKey = '') {
  const endpoint = normalizeBaseUrl(baseUrl);
  let response;
  try {
    response = await fetch(`${endpoint}/models`, {
      headers: { Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(8000), redirect: 'error'
    });
  } catch { throw new Error('Cannot reach the model gateway. Confirm its URL and try again.'); }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new Error('The gateway rejected the API key. Add a gateway key and test again.');
    throw new Error(`Gateway model discovery returned HTTP ${response.status}`);
  }
  let text = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
    if (text.length > 2000000) throw new Error('The gateway returned an oversized model catalog');
  }
  text += decoder.decode();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('The gateway did not return a JSON model catalog. Check the base URL.'); }
  if (!Array.isArray(result.data)) throw new Error('The gateway returned an unexpected model catalog');
  const models = [...new Set(result.data.filter(m => m && typeof m.id === 'string').map(m => modelId(m.id)).filter(Boolean))].slice(0, 10000).sort();
  return models;
}

export function routingEnvironment(kind, route, apiKey = '', env = process.env) {
  const result = { ...env, NO_COLOR: '1' };
  if (!['omniroute', 'openrouter'].includes(route?.provider)) return result;
  if (kind === 'codex') result[route.provider === 'openrouter' ? 'ULTHARNESS_OPENROUTER_KEY' : 'ULTHARNESS_OMNIROUTE_KEY'] = apiKey || 'local';
  if (kind === 'claude') Object.assign(result, {
    ANTHROPIC_BASE_URL: normalizeBaseUrl(route.baseUrl).replace(/\/v1$/, ''),
    ANTHROPIC_AUTH_TOKEN: apiKey || 'local', ANTHROPIC_API_KEY: '', ANTHROPIC_MODEL: route.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: route.model, ANTHROPIC_DEFAULT_SONNET_MODEL: route.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: route.model,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1', CLAUDE_CODE_USE_BEDROCK: '0', CLAUDE_CODE_USE_VERTEX: '0', CLAUDE_CODE_USE_FOUNDRY: '0'
  });
  return result;
}
