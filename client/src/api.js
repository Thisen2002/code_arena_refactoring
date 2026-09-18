export async function request(path, options = {}) {
  const headers = { 'X-Requested-With': 'CodeArena', ...options.headers };
  if (typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    credentials: 'same-origin', ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(130000),
  });
  const text = await response.text();
  let data = {};
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
