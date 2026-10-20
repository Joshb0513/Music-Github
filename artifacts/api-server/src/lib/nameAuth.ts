import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, sessionsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '@workspace/api-zod';

// Name-only sign-in is intentionally lightweight, not proof of identity.
export const SESSION_COOKIE = 'sid';
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export interface NameSession { user: AuthUser; displayName: string; }

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_TTL };
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 50 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export async function nameLogin(req: Request, res: Response) {
  const displayName = normalizeName(req.body?.name);
  if (!displayName) {
    res.status(400).json({ error: 'Enter a name between 1 and 50 characters.' });
    return;
  }
  // Stable owner ID means the same entered name sees its prior uploads. Since
  // there is no password, another person can intentionally or accidentally use it.
  const identity = crypto.createHash('sha256').update(displayName.toLocaleLowerCase('en-US')).digest('hex');
  const user: AuthUser = { id: `name:${identity}`, email: null, firstName: displayName, lastName: null, profileImageUrl: null };
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({ sid, sess: { user, displayName } as unknown as Record<string, unknown>, expire: new Date(Date.now() + SESSION_TTL) });
  res.cookie(SESSION_COOKIE, sid, cookieOptions());
  res.json({ user });
}

export async function nameLogout(req: Request, res: Response) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (typeof sid === 'string' && /^[a-f0-9]{64}$/.test(sid)) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  res.json({ ok: true });
}

export async function nameUser(req: Request, res: Response) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) { res.json({ user: null }); return; }
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
  if (!row || row.expire < new Date()) {
    if (row) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ user: null });
    return;
  }
  const session = row.sess as unknown as NameSession;
  res.json({ user: session.user || null });
}

export async function nameAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (typeof sid === 'string' && /^[a-f0-9]{64}$/.test(sid)) {
      const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
      if (row && row.expire >= new Date()) {
        const session = row.sess as unknown as NameSession;
        if (session.user?.id) req.user = session.user as Express.User;
      }
    }
    req.isAuthenticated = function (this: Request) { return this.user != null; } as Request['isAuthenticated'];
    next();
  } catch (error) { next(error); }
}
