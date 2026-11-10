async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export const api = {
  register: (b) => req('POST', '/api/auth/register', b),
  login: (b) => req('POST', '/api/auth/login', b),
  logout: () => req('POST', '/api/auth/logout'),
  list: () => req('GET', '/api/entries'),
  create: (b) => req('POST', '/api/entries', b),
  update: (id, b) => req('PUT', `/api/entries/${id}`, b),
  remove: (id) => req('DELETE', `/api/entries/${id}`),
};
