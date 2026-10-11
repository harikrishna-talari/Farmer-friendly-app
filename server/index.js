import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, scrypt as scryptCallback, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initializeDatabase } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const sessionCookie = 'farmer_session';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const scrypt = promisify(scryptCallback);
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(serverDirectory);
const production = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'farmer-friendly-development-session-secret';

if (production && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set before starting the server in production.');
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https://images.unsplash.com'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'script-src': ["'self'"],
      'connect-src': ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '32kb' }));
const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many account attempts. Please try again in 15 minutes.' }
});

const createError = (status, message) => Object.assign(new Error(message), { status });
const hashToken = (token) => createHmac('sha256', sessionSecret).update(token).digest('hex');
const userFromRow = ({ id, name, email }) => ({ id, name, email });
const isValidEmail = (email) => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const boundedText = (value, maxLength) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
const parseCookies = (header = '') => Object.fromEntries(
  header.split(';').map((part) => part.trim().split(/=(.*)/s, 2)).filter(([name, value]) => name && value !== undefined)
);
const setSessionCookie = (res, token) => res.cookie(sessionCookie, token, {
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  path: '/',
  maxAge: sessionLifetime
});
const clearSessionCookie = (res) => res.clearCookie(sessionCookie, {
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  path: '/'
});

const findUserBySession = async (req) => {
  const token = parseCookies(req.headers.cookie)[sessionCookie];
  if (!token || token.length > 128) return null;
  const [rows] = await db.execute(`
    SELECT users.id, users.name, users.email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, [hashToken(token), Date.now()]);
  const row = rows[0];
  return row ? userFromRow(row) : null;
};

const requireUser = async (req, _res, next) => {
  try {
    const user = await findUserBySession(req);
    if (!user) return next(createError(401, 'Sign in to continue.'));
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

const priceTrends = [
  { crop: 'Organic Durum Wheat', currentPrice: '$320 / Ton', change: '+8.4%', trend: 'up', high: '$345', low: '$290' },
  { crop: 'Heirloom San Marzano Tomatoes', currentPrice: '$1.85 / kg', change: '+12.1%', trend: 'up', high: '$2.10', low: '$1.40' },
  { crop: 'Cold-Pressed Extra Virgin Olive Oil', currentPrice: '$9.20 / L', change: '-2.3%', trend: 'down', high: '$10.50', low: '$8.80' },
  { crop: 'Sweet Hass Avocados', currentPrice: '$2.40 / kg', change: '+4.5%', trend: 'up', high: '$2.60', low: '$2.10' }
];

const weatherAdvisory = {
  temperature: '24°C',
  condition: 'Partly Sunny • Ideal Harvesting Window',
  soilMoisture: 'Optimal (62%)',
  pestRisk: 'Low',
  tip: 'Incoming light precipitation in 48 hours. Recommend completing grain desiccation and storage bin aeration today.'
};

app.get('/api/health', async (_req, res, next) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/register', authenticationLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!boundedText(name, 80)) throw createError(400, 'Enter your name (up to 80 characters).');
    if (!isValidEmail(email)) throw createError(400, 'Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw createError(400, 'Password must be between 8 and 128 characters.');
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase() };
    try {
      await db.execute(
        'INSERT INTO users (id, name, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.email, salt, passwordHash, new Date().toISOString().slice(0, 19).replace('T', ' ')]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw createError(409, 'An account with this email already exists.');
      throw error;
    }

    const token = randomBytes(32).toString('base64url');
    await db.execute(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [hashToken(token), user.id, Date.now() + sessionLifetime]
    );
    setSessionCookie(res, token);
    return res.status(201).json({ user });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', authenticationLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || typeof password !== 'string' || password.length > 128) {
      throw createError(400, 'Enter a valid email and password.');
    }
    const [rows] = await db.execute('SELECT id, name, email, password_salt, password_hash FROM users WHERE email = ?', [email.trim()]);
    const row = rows[0];
    const salt = row?.password_salt || '0'.repeat(32);
    const expected = row?.password_hash || '0'.repeat(128);
    const actual = (await scrypt(password, salt, 64)).toString('hex');
    const valid = timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
    if (!row || !valid) throw createError(401, 'Email or password is incorrect.');

    const token = randomBytes(32).toString('base64url');
    await db.execute('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
    await db.execute(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [hashToken(token), row.id, Date.now() + sessionLifetime]
    );
    setSessionCookie(res, token);
    return res.json({ user: userFromRow(row) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const user = await findUserBySession(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[sessionCookie];
    if (token && token.length <= 128) {
      await db.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    }
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

app.get('/api/listings', async (_req, res, next) => {
  try {
    const [rows] = await db.query('SELECT payload FROM listings ORDER BY created_at DESC, id DESC');
    return res.json({ listings: rows.map(({ payload }) => JSON.parse(payload)) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/listings', requireUser, async (req, res, next) => {
  try {
    const { title, farmer, farmLocation, category, price, unit, availableQty, description } = req.body || {};
    if (!boundedText(title, 120) || !boundedText(farmer, 100) || !boundedText(farmLocation, 120)) {
      throw createError(400, 'Enter a crop name, farm name, and farm location.');
    }
    if (!['Grains', 'Vegetables', 'Oils & Specialty'].includes(category)) throw createError(400, 'Choose a supported crop category.');
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) throw createError(400, 'Enter a valid price.');
    if (!Number.isInteger(availableQty) || availableQty <= 0 || availableQty > 1_000_000_000) throw createError(400, 'Enter a valid available quantity.');
    if (!['Ton', 'kg', 'Liter', 'Bushel'].includes(unit)) throw createError(400, 'Choose a supported unit.');
    if (description !== undefined && (typeof description !== 'string' || description.length > 1000)) throw createError(400, 'Description must be 1,000 characters or fewer.');

    const listing = {
      id: `CROP-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: title.trim(),
      farmer: farmer.trim(),
      farmLocation: farmLocation.trim(),
      category,
      image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80',
      price,
      unit,
      availableQty,
      minOrder: 1,
      harvestDate: 'Current Season',
      moistureContent: 'Verified Dry',
      rating: 5.0,
      reviewsCount: 1,
      organicCertified: false,
      description: description?.trim() || 'Direct harvest from sustainable family-operated farm.'
    };
    await db.execute(
      'INSERT INTO listings (id, owner_id, payload) VALUES (?, ?, ?)',
      [listing.id, req.user.id, JSON.stringify(listing)]
    );
    return res.status(201).json({ listing });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/orders', requireUser, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT payload FROM orders WHERE owner_id IS NULL OR owner_id = ? ORDER BY created_at DESC, id DESC',
      [req.user.id]
    );
    return res.json({ orders: rows.map(({ payload }) => JSON.parse(payload)) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/orders', requireUser, async (req, res, next) => {
  try {
    const { cropId, quantity, buyerName } = req.body || {};
    if (!boundedText(cropId, 80) || !Number.isInteger(quantity) || quantity <= 0 || !boundedText(buyerName, 120)) {
      throw createError(400, 'Enter a crop, whole-number quantity, and buyer name.');
    }
    const [listingRows] = await db.execute('SELECT id, owner_id, payload FROM listings WHERE id = ?', [cropId]);
    const listingRow = listingRows[0];
    if (!listingRow) throw createError(404, 'That crop listing is no longer available.');
    if (listingRow.owner_id === req.user.id) throw createError(400, 'You cannot place an order on your own listing.');

    const listing = JSON.parse(listingRow.payload);
    if (quantity < listing.minOrder || quantity > listing.availableQty) {
      throw createError(400, `Order quantity must be between ${listing.minOrder} and ${listing.availableQty} ${listing.unit}.`);
    }
    const order = {
      id: `ORD-${randomUUID().slice(0, 8).toUpperCase()}`,
      cropId: listing.id,
      title: listing.title,
      farmer: listing.farmer,
      quantity,
      unit: listing.unit,
      totalCost: Number((quantity * listing.price).toFixed(2)),
      buyerName: buyerName.trim(),
      status: 'Dispatched to Freight',
      orderDate: 'Just now'
    };
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [latestRows] = await connection.execute('SELECT payload FROM listings WHERE id = ? FOR UPDATE', [listing.id]);
      if (!latestRows.length) throw createError(404, 'That crop listing is no longer available.');
      const latest = JSON.parse(latestRows[0].payload);
      if (quantity > latest.availableQty) throw createError(409, 'There is not enough crop available for that order.');
      latest.availableQty -= quantity;
      await connection.execute('UPDATE listings SET payload = ? WHERE id = ?', [JSON.stringify(latest), listing.id]);
      await connection.execute(
        'INSERT INTO orders (id, owner_id, payload) VALUES (?, ?, ?)',
        [order.id, req.user.id, JSON.stringify(order)]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/prices', (_req, res) => res.json({ priceTrends }));
app.get('/api/weather', (_req, res) => res.json({ weatherAdvisory, source: 'sample' }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

if (production) {
  app.use(express.static(path.join(projectDirectory, 'dist')));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(projectDirectory, 'dist', 'index.html')));
}

app.use((error, _req, res, _next) => {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

await initializeDatabase();
app.listen(port, '127.0.0.1', () => {
  console.log(`Farmer Friendly API connected to MySQL and listening on http://127.0.0.1:${port}`);
});
