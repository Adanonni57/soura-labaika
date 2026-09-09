import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Principal } from './types.js';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? 'development-only-secret-change-me-32');
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export async function signSession(p: Principal): Promise<string> {
  const ttl = Number(process.env.SESSION_TTL_MINUTES ?? 30);
  return new SignJWT({ role: p.role, etablissementId: p.etablissementId, sessionId: p.sessionId })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(p.userId).setIssuedAt().setExpirationTime(`${ttl}m`).sign(secret());
}

export async function verifySession(token: string): Promise<Principal> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
  if (!payload.sub || !payload.role || !payload.etablissementId || !payload.sessionId) throw new Error('Jeton incomplet');
  return { userId: payload.sub, role: payload.role as Principal['role'], etablissementId: String(payload.etablissementId), sessionId: String(payload.sessionId) };
}
