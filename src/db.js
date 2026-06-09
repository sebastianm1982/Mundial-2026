const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'prode.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL,
      group_name TEXT,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      is_finished INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, match_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
  `);
}

function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@prode.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!exists) {
    db.prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run('Admin', adminEmail, bcrypt.hashSync(adminPassword, 10));
  }
}

function seedMatches() {
  const count = db.prepare('SELECT COUNT(*) AS total FROM matches').get().total;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO matches (stage, group_name, home_team, away_team, starts_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const demo = [
    ['Fase de grupos', 'A', 'Argentina', 'Marruecos', '2026-06-11T16:00'],
    ['Fase de grupos', 'A', 'España', 'Japón', '2026-06-11T19:00'],
    ['Fase de grupos', 'B', 'Brasil', 'México', '2026-06-12T16:00'],
    ['Fase de grupos', 'B', 'Francia', 'Canadá', '2026-06-12T19:00'],
    ['Fase de grupos', 'C', 'Alemania', 'Uruguay', '2026-06-13T16:00'],
    ['Fase de grupos', 'C', 'Inglaterra', 'Estados Unidos', '2026-06-13T19:00'],
    ['Octavos de final', null, '1° Grupo A', '2° Grupo B', '2026-06-28T16:00'],
    ['Cuartos de final', null, 'Ganador Octavos 1', 'Ganador Octavos 2', '2026-07-04T16:00'],
    ['Semifinal', null, 'Ganador Cuartos 1', 'Ganador Cuartos 2', '2026-07-09T16:00'],
    ['Final', null, 'Ganador Semi 1', 'Ganador Semi 2', '2026-07-19T16:00']
  ];

  const tx = db.transaction(rows => rows.forEach(r => insert.run(...r)));
  tx(demo);
}

function scorePrediction(pred, match) {
  if (!match.is_finished || match.home_score === null || match.away_score === null) return 0;
  if (!pred) return 0;

  if (pred.home_score === match.home_score && pred.away_score === match.away_score) return 6;

  const realSign = Math.sign(match.home_score - match.away_score);
  const predSign = Math.sign(pred.home_score - pred.away_score);
  return realSign === predSign ? 3 : 0;
}

function initDb() {
  migrate();
  seedAdmin();
  seedMatches();
}

module.exports = { db, initDb, scorePrediction };
