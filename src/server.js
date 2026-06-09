require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const path = require('path');
const { db, initDb, scorePrediction } = require('./db');

initDb();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, '..', 'data') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = req.session.error || null;
  res.locals.success = req.session.success || null;
  delete req.session.error;
  delete req.session.success;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user?.is_admin) return res.status(403).render('error', { message: 'No tenés permisos de administrador.' });
  next();
}

function parseScore(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

app.get('/', (req, res) => res.redirect(req.session.user ? '/fixture' : '/login'));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 4) {
    req.session.error = 'Completá nombre, email y una contraseña de al menos 4 caracteres.';
    return res.redirect('/register');
  }
  try {
    const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10));
    req.session.user = { id: info.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), is_admin: 0 };
    res.redirect('/fixture');
  } catch (err) {
    req.session.error = 'Ese email ya está registrado.';
    res.redirect('/register');
  }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    req.session.error = 'Email o contraseña incorrectos.';
    return res.redirect('/login');
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin };
  res.redirect('/fixture');
});

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/fixture', requireAuth, (req, res) => {
  const matches = db.prepare(`
    SELECT m.*, p.home_score AS pred_home, p.away_score AS pred_away
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
    ORDER BY datetime(m.starts_at), m.id
  `).all(req.session.user.id);
  res.render('fixture', { matches, now: new Date() });
});

app.post('/predictions/:matchId', requireAuth, (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.matchId);
  if (!match) return res.status(404).render('error', { message: 'Partido no encontrado.' });
  if (new Date(match.starts_at) <= new Date()) {
    req.session.error = 'El pronóstico está cerrado porque el partido ya empezó.';
    return res.redirect('/fixture');
  }
  const home = parseScore(req.body.home_score);
  const away = parseScore(req.body.away_score);
  if (home === null || away === null) {
    req.session.error = 'Ingresá resultados válidos, sin negativos.';
    return res.redirect('/fixture');
  }
  db.prepare(`
    INSERT INTO predictions (user_id, match_id, home_score, away_score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      updated_at = CURRENT_TIMESTAMP
  `).run(req.session.user.id, match.id, home, away);
  req.session.success = 'Pronóstico guardado.';
  res.redirect('/fixture');
});

app.get('/ranking', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, name, email FROM users ORDER BY name').all();
  const matches = db.prepare('SELECT * FROM matches').all();
  const predictions = db.prepare('SELECT * FROM predictions').all();
  const byUserMatch = new Map(predictions.map(p => [`${p.user_id}-${p.match_id}`, p]));

  const ranking = users.map(u => {
    let points = 0, exacts = 0, hits = 0;
    for (const m of matches) {
      const pts = scorePrediction(byUserMatch.get(`${u.id}-${m.id}`), m);
      points += pts;
      if (pts === 6) exacts++;
      if (pts === 3) hits++;
    }
    return { ...u, points, exacts, hits };
  }).sort((a, b) => b.points - a.points || b.exacts - a.exacts || a.name.localeCompare(b.name));

  res.render('ranking', { ranking });
});

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const matches = db.prepare('SELECT * FROM matches ORDER BY datetime(starts_at), id').all();
  res.render('admin', { matches });
});

app.post('/admin/matches', requireAuth, requireAdmin, (req, res) => {
  const { stage, group_name, home_team, away_team, starts_at } = req.body;
  if (!stage || !home_team || !away_team || !starts_at) {
    req.session.error = 'Completá etapa, equipos y fecha.';
    return res.redirect('/admin');
  }
  db.prepare('INSERT INTO matches (stage, group_name, home_team, away_team, starts_at) VALUES (?, ?, ?, ?, ?)')
    .run(stage, group_name || null, home_team, away_team, starts_at);
  req.session.success = 'Partido creado.';
  res.redirect('/admin');
});

app.post('/admin/matches/:id/result', requireAuth, requireAdmin, (req, res) => {
  const home = parseScore(req.body.home_score);
  const away = parseScore(req.body.away_score);
  if (home === null || away === null) {
    req.session.error = 'Resultado inválido.';
    return res.redirect('/admin');
  }
  db.prepare('UPDATE matches SET home_score = ?, away_score = ?, is_finished = 1 WHERE id = ?')
    .run(home, away, req.params.id);
  req.session.success = 'Resultado actualizado.';
  res.redirect('/admin');
});

app.post('/admin/matches/:id/delete', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
  req.session.success = 'Partido eliminado.';
  res.redirect('/admin');
});

app.listen(PORT, () => console.log(`Prode Mundial corriendo en http://localhost:${PORT}`));
