import { Router } from 'express';
import {
  createEmailUser,
  findByEmail,
  verifyPassword,
  upsertGoogleUser,
  toPublicUser,
} from '../auth/users.js';
import { signToken } from '../auth/jwt.js';
import { verifyGoogleIdToken } from '../auth/google.js';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  try {
    const { email, password, displayName } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: '이메일과 비밀번호가 필요합니다.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: '비밀번호는 8자 이상이어야 합니다.' });
    }
    const user = createEmailUser(
      email,
      password,
      typeof displayName === 'string' ? displayName : undefined,
    );
    const accessToken = signToken(user.id, user.email);
    res.status(201).json({ accessToken, user: toPublicUser(user) });
  } catch (e) {
    if (e instanceof Error && e.name === 'EMAIL_TAKEN') {
      return res.status(409).json({ message: '이미 가입된 이메일입니다.' });
    }
    if (e instanceof Error && e.message === 'JWT_SECRET_MISSING') {
      return res.status(503).json({ message: '서버에 JWT_SECRET이 설정되지 않았습니다.' });
    }
    console.error(e);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

authRouter.post('/login', (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: '이메일과 비밀번호를 입력해 주세요.' });
    }
    const user = findByEmail(email);
    if (!user || !verifyPassword(user, password)) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const accessToken = signToken(user.id, user.email);
    res.json({ accessToken, user: toPublicUser(user) });
  } catch (e) {
    if (e instanceof Error && e.message === 'JWT_SECRET_MISSING') {
      return res.status(503).json({ message: '서버에 JWT_SECRET이 설정되지 않았습니다.' });
    }
    console.error(e);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

authRouter.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body ?? {};
    if (typeof idToken !== 'string' || !idToken) {
      return res.status(400).json({ message: 'Google ID 토큰이 필요합니다.' });
    }
    const g = await verifyGoogleIdToken(idToken);
    const user = upsertGoogleUser(g.sub, g.email, g.name, g.picture);
    const accessToken = signToken(user.id, user.email);
    res.json({ accessToken, user: toPublicUser(user) });
  } catch (e) {
    if (e instanceof Error && e.name === 'GOOGLE_CLIENT_ID_MISSING') {
      return res.status(503).json({ message: '서버에 GOOGLE_CLIENT_ID가 설정되지 않았습니다.' });
    }
    if (e instanceof Error && e.message === 'JWT_SECRET_MISSING') {
      return res.status(503).json({ message: '서버에 JWT_SECRET이 설정되지 않았습니다.' });
    }
    console.error(e);
    return res.status(401).json({ message: 'Google 로그인에 실패했습니다.' });
  }
});
