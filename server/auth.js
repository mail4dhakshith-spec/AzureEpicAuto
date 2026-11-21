import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export async function verifyPassword(password, storedPassword) {
  if (typeof password !== 'string' || typeof storedPassword !== 'string') return false;

  if (!storedPassword.startsWith('scrypt$')) {
    const actual = Buffer.from(password);
    const expected = Buffer.from(storedPassword);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  const parts = storedPassword.split('$');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return false;

  try {
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = scryptSync(password, salt, 64);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest();
}

export function createSessionToken(account, secret, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: account.id,
    username: account.username,
    role: account.role,
    ownerId: account.ownerId || '',
    name: account.name || '',
    phone: account.phone || '',
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  })).toString('base64url');
  const unsigned = `v1.${payload}`;
  return `${unsigned}.${signature(unsigned, secret).toString('base64url')}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [version, payload, encodedSignature, extra] = token.split('.');
  if (version !== 'v1' || !payload || !encodedSignature || extra !== undefined) return null;
  const unsigned = `${version}.${payload}`;
  const actualSignature = Buffer.from(encodedSignature, 'base64url');
  const expectedSignature = signature(unsigned, secret);
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;
  try {
    const account = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(now / 1000);
    if (!account.sub || !['owner', 'admin'].includes(account.role) || !Number.isInteger(account.exp) || account.exp <= nowSeconds || account.iat > nowSeconds + 60) return null;
    if (account.role === 'owner' && !account.ownerId) return null;
    return {
      id: account.sub,
      username: account.username,
      phone: account.phone,
      app_metadata: { role: account.role, ownerId: account.ownerId },
      user_metadata: { full_name: account.name },
    };
  } catch {
    return null;
  }
}

export function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftDigest = createHmac('sha256', 'treasury-secret-comparison').update(left).digest();
  const rightDigest = createHmac('sha256', 'treasury-secret-comparison').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
