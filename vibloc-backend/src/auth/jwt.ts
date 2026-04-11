import jwt from 'jsonwebtoken';

export function signToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 8) {
    throw new Error('JWT_SECRET_MISSING');
  }
  return jwt.sign({ sub: userId, email }, secret, { expiresIn: '7d' });
}
