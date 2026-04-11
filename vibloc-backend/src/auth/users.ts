import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  googleSub?: string;
  /** Google picture 또는 추후 업로드 URL */
  avatarUrl?: string;
};

const byId = new Map<string, UserRecord>();
const byEmail = new Map<string, string>();
const byGoogle = new Map<string, string>();

export function createEmailUser(
  email: string,
  password: string,
  displayName?: string,
): UserRecord {
  const norm = email.toLowerCase().trim();
  if (byEmail.has(norm)) {
    const err = new Error('EMAIL_TAKEN');
    err.name = 'EMAIL_TAKEN';
    throw err;
  }
  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  const u: UserRecord = {
    id,
    email: norm,
    displayName: (displayName?.trim() || norm.split('@')[0]) || 'user',
    passwordHash,
  };
  byId.set(id, u);
  byEmail.set(norm, id);
  return u;
}

export function findByEmail(email: string): UserRecord | undefined {
  const id = byEmail.get(email.toLowerCase().trim());
  return id ? byId.get(id) : undefined;
}

export function verifyPassword(u: UserRecord, password: string): boolean {
  if (!u.passwordHash) return false;
  return bcrypt.compareSync(password, u.passwordHash);
}

/** Google 계정 연결 또는 신규 생성. 같은 이메일의 이메일 가입 계정이 있으면 googleSub만 붙임. */
export function upsertGoogleUser(
  googleSub: string,
  email: string,
  name?: string,
  picture?: string,
): UserRecord {
  const existingG = byGoogle.get(googleSub);
  if (existingG) {
    const u = byId.get(existingG);
    if (u) {
      if (picture?.trim()) u.avatarUrl = picture.trim();
      if (name?.trim()) u.displayName = name.trim();
      return u;
    }
  }

  const norm = email.toLowerCase().trim();
  const existingId = byEmail.get(norm);
  if (existingId) {
    const u = byId.get(existingId);
    if (u) {
      u.googleSub = googleSub;
      byGoogle.set(googleSub, u.id);
      if (name?.trim()) u.displayName = name.trim();
      if (picture?.trim()) u.avatarUrl = picture.trim();
      return u;
    }
  }

  const id = crypto.randomUUID();
  const u: UserRecord = {
    id,
    email: norm,
    displayName: (name?.trim() || norm.split('@')[0]) || 'user',
    googleSub,
    avatarUrl: picture?.trim() || undefined,
  };
  byId.set(id, u);
  byEmail.set(norm, id);
  byGoogle.set(googleSub, id);
  return u;
}

export function toPublicUser(u: UserRecord) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
  };
}
