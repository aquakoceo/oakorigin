import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/organize.js';

const env = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','AI_API_KEY','AI_MODEL'];
const saved = Object.fromEntries(env.map(key => [key, process.env[key]]));
const reply = () => ({ statusCode: 200, headers: {}, setHeader(key,value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('topic organization rejects callers without a valid membership before reading chat or calling AI', async () => {
  env.forEach(key => { process.env[key] = key === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'test'; });
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async url => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-1' }) };
    if (String(url).includes('/rest/v1/memberships')) return { ok: true, json: async () => [{ status: 'pending', roles: { can_organize: true } }] };
    throw new Error('Unauthorized caller reached privileged service');
  };
  try {
    const response = reply();
    await handler({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { roomId: '11111111-1111-4111-8111-111111111111' } }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(url => !url.includes('api.openai.com')));
  } finally {
    global.fetch = originalFetch;
    env.forEach(key => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
  }
});

