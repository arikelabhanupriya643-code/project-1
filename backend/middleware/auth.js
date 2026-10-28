const jwt = require('jsonwebtoken');
const COOKIE_NAME = process.env.COOKIE_NAME || 'campusconnect_session';
function signInCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'campusconnect' });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 });
}
function clearSession(res) { res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); }
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try { const claims = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'campusconnect' }); req.auth = { id: claims.sub, role: claims.role }; next(); }
  catch { clearSession(res); return res.status(401).json({ error: 'Your session has expired. Please log in again.' }); }
}
function requireAdmin(req, res, next) { if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' }); next(); }
module.exports = { signInCookie, clearSession, requireAuth, requireAdmin };