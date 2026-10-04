import assert from 'node:assert/strict';
import test from 'node:test';
import { validateServerUrl } from '../apps/web/build/server-url.js';

test('Vercel requires an explicit secure game endpoint while local same-origin builds still work', () => {
  assert.doesNotThrow(() => validateServerUrl(undefined, false));
  assert.doesNotThrow(() => validateServerUrl('ws://127.0.0.1:2567', false));
  assert.doesNotThrow(() => validateServerUrl('wss://api.example.com', true));
  for (const value of [undefined, '', 'ws://api.example.com', 'https://api.example.com', 'invalid'])
    assert.throws(() => validateServerUrl(value, true));
});

test('game endpoint configuration rejects credentials, paths, query strings and whitespace', () => {
  for (const value of [
    'wss://user:pass@api.example.com',
    'wss://api.example.com/other',
    'wss://api.example.com?token=example',
    'wss://api.example.com#fragment',
    ' wss://api.example.com',
  ])
    assert.throws(() => validateServerUrl(value, true));
});
