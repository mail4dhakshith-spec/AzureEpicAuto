import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import test from 'node:test';
import { createSessionToken, verifyPassword, verifySessionToken } from './auth.js';

const secret = 'test-secret-with-at-least-thirty-two-characters';

test('stores and verifies owner passwords directly', async () => {
  const password = 'Long test owner password 1!';
  const storedPassword = password;
  assert.equal(await verifyPassword(password, storedPassword), true);
  assert.equal(await verifyPassword('wrong password', storedPassword), false);
  assert.equal(await verifyPassword(password, 'not-a-hash'), false);
});

test('verifies scrypt password hashes', async () => {
  const password = 'Long test owner password 1!';
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  const storedPassword = `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  assert.equal(await verifyPassword(password, storedPassword), true);
  assert.equal(await verifyPassword('wrong password', storedPassword), false);
});

test('signs role-bound sessions and rejects expiry or tampering', () => {
  const now = Date.now();
  const account = { id: 'OWN-00001', username: 'owner.login', role: 'owner', ownerId: 'OWN-00001', name: 'Owner Name', phone: '+15555550101' };
  const token = createSessionToken(account, secret, now);
  const user = verifySessionToken(token, secret, now);
  assert.equal(user.app_metadata.role, 'owner');
  assert.equal(user.app_metadata.ownerId, account.ownerId);
  assert.equal(verifySessionToken(`${token}x`, secret, now), null);
  assert.equal(verifySessionToken(token, secret, now + 9 * 60 * 60 * 1000), null);
  assert.equal(verifySessionToken(token, `${secret}different`, now), null);
});