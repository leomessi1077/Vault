const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { MONGODB_URI, JWT_SECRET } = process.env;
const isProd = process.env.NODE_ENV === 'production';

/* ---------- DB (cached for serverless) ---------- */
const cache = global._vaultMongo || (global._vaultMongo = { conn: null, promise: null });
async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) cache.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false });
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  authHash: { type: String, required: true },
}, { timestamps: true }));

// Server only ever stores ciphertext (iv + data). It cannot read your passwords.
const Entry = mongoose.models.Entry || mongoose.model('Entry', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  iv: { type: String, required: true },
  data: { type: String, required: true },
}, { timestamps: true }));

/* ---------- helpers ---------- */
const HEX64 = /^[a-f0-9]{64}$/;
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^\S+@\S+\.\S+$/.test(e);
const validBlob = (b) =>
  b && typeof b.iv === 'string' && typeof b.data === 'string' && b.iv.length <= 64 && b.data.length <= 20000;
const DUMMY_HASH = bcrypt.hashSync('0'.repeat(64), 10);

function setAuthCookie(res, userId) {
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '12h', algorithm: 'HS256' });
  res.cookie('token', token, { httpOnly: true, secure: isProd, sameSite: 'strict', maxAge: 12 * 3600 * 1000, path: '/' });
}

function requireAuth(req, res, next) {
  try {
    req.userId = jwt.verify(req.cookies.token, JWT_SECRET, { algorithms: ['HS256'] }).id;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(async (req, res, next) => {
  try { await connectDB(); next(); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Database connection failed' }); }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' } });

/* ----- auth ----- */
// Personal use: registration works only while there are zero users.
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { email, authHash } = req.body || {};
  if (!validEmail(email) || !HEX64.test(authHash)) return res.status(400).json({ error: 'Invalid input' });
  if ((await User.countDocuments()) > 0) return res.status(403).json({ error: 'Registration is closed' });
  const user = await User.create({ email, authHash: await bcrypt.hash(authHash, 10) });
  setAuthCookie(res, user.id);
  res.json({ ok: true });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, authHash } = req.body || {};
  if (!validEmail(email) || !HEX64.test(authHash)) return res.status(400).json({ error: 'Invalid input' });
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  const ok = await bcrypt.compare(authHash, user ? user.authHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Wrong email or master password' });
  setAuthCookie(res, user.id);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});

/* ----- entries ----- */
app.get('/api/entries', requireAuth, async (req, res) => {
  res.json(await Entry.find({ user: req.userId }).select('iv data').lean());
});

app.post('/api/entries', requireAuth, async (req, res) => {
  if (!validBlob(req.body)) return res.status(400).json({ error: 'Invalid input' });
  const e = await Entry.create({ user: req.userId, iv: req.body.iv, data: req.body.data });
  res.status(201).json({ _id: e.id });
});

app.put('/api/entries/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !validBlob(req.body)) return res.status(400).json({ error: 'Invalid input' });
  const e = await Entry.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { iv: req.body.iv, data: req.body.data });
  if (!e) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid input' });
  const r = await Entry.deleteOne({ _id: req.params.id, user: req.userId });
  if (!r.deletedCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
