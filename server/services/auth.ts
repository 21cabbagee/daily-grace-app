import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";

const ISSUER = "daily-grace";
const SESSION_TTL = "30d";
const ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

/** Compared against when an email is unknown, so sign-in timing doesn't reveal which emails exist. */
export const DUMMY_HASH = bcrypt.hashSync("daily-grace-timing-equalizer", ROUNDS);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionClaims {
  userId: number;
  tokenVersion: number;
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({ tv: claims.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.userId))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(new TextEncoder().encode(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: ISSUER });
    const userId = Number(payload.sub);
    const tokenVersion = typeof payload.tv === "number" ? payload.tv : NaN;
    if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) return null;
    return { userId, tokenVersion };
  } catch {
    return null;
  }
}
