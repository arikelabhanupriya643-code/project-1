const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const { signInCookie, clearSession, requireAuth } = require('../middleware/auth');
const router = express.Router();
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
router.post('/register', async (req, res, next) => { try {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;
  if (name.length < 2 || name.length > 100 || !validEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Enter a name (2–100 characters), valid email, and password (8–72 characters).' });
  const password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('profiles').insert({ name, email, password_hash, role: 'student' }).select('id,name,email,role').single();
  if (error?.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
  if (error) throw error;
  signInCookie(res, data); res.status(201).json({ user: data });
} catch (e) { next(e); } });
router.post('/login', async (req, res, next) => { try {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;
  if (!validEmail(email) || typeof password !== 'string' || password.length > 72) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const { data, error } = await supabase.from('profiles').select('id,name,email,role,password_hash').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data || !(await bcrypt.compare(password, data.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  const user = { id: data.id, name: data.name, email: data.email, role: data.role };
  signInCookie(res, user); res.json({ user });
} catch (e) { next(e); } });
router.get('/me', requireAuth, async (req, res, next) => { try {
  const { data, error } = await supabase.from('profiles').select('id,name,email,role').eq('id', req.auth.id).maybeSingle();
  if (error) throw error;
  if (!data) { clearSession(res); return res.status(401).json({ error: 'Account not found. Please log in again.' }); }
  res.json({ user: data });
} catch (e) { next(e); } });
router.post('/logout', (req, res) => { clearSession(res); res.json({ message: 'Logged out.' }); });
module.exports = router;