import { OAuth2Client } from 'google-auth-library';

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId?.trim()) {
    const err = new Error('GOOGLE_CLIENT_ID_MISSING');
    err.name = 'GOOGLE_CLIENT_ID_MISSING';
    throw err;
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }
  return {
    sub: p.sub,
    email: p.email,
    name: p.name ?? undefined,
    picture: typeof p.picture === 'string' && p.picture ? p.picture : undefined,
  };
}
