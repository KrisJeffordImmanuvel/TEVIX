'use strict';

// Storage backends. Both expose the same async interface:
//   init(), getInterest(), incrementInterest(),
//   addApplication(app) -> { id } or null when the email already applied,
//   listApplications()

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------- JSON file (local development) ----------

function createFileStore(dataDir) {
  const dbFile = path.join(dataDir, 'db.json');
  let db = { interestCount: 0, applications: [] };
  let writeQueue = Promise.resolve();

  // Writes are serialised and atomic (write to temp file, then rename).
  function save() {
    const snapshot = JSON.stringify(db, null, 2);
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        await fsp.mkdir(dataDir, { recursive: true });
        const tmp = `${dbFile}.${process.pid}.tmp`;
        await fsp.writeFile(tmp, snapshot);
        await fsp.rename(tmp, dbFile);
      });
    return writeQueue;
  }

  return {
    kind: `file (${dbFile})`,

    async init() {
      try {
        const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        db = {
          interestCount: Number(parsed.interestCount) || 0,
          applications: Array.isArray(parsed.applications) ? parsed.applications : []
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Could not read ${dbFile}, starting empty:`, err.message);
        }
      }
    },

    async getInterest() {
      return db.interestCount;
    },

    async incrementInterest() {
      db.interestCount += 1;
      await save();
      return db.interestCount;
    },

    async addApplication(app) {
      const email = app.email.toLowerCase();
      if (db.applications.some((a) => a.email.toLowerCase() === email)) return null;
      const record = { id: crypto.randomUUID(), ...app, createdAt: new Date().toISOString() };
      db.applications.push(record);
      await save();
      return { id: record.id };
    },

    async listApplications() {
      return db.applications;
    }
  };
}

// ---------- PostgreSQL (production) ----------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS counters (
    name  text PRIMARY KEY,
    value bigint NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS applications (
    id         uuid PRIMARY KEY,
    name       text NOT NULL,
    email      text NOT NULL,
    year       text NOT NULL DEFAULT '',
    message    text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS applications_email_key ON applications (lower(email));
`;

function createPgStore(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, max: 5 });

  pool.on('error', (err) => console.error('Postgres pool error:', err.message));

  return {
    kind: 'postgres',

    async init() {
      await pool.query(SCHEMA);
    },

    async getInterest() {
      const { rows } = await pool.query("SELECT value FROM counters WHERE name = 'interest'");
      return rows.length ? Number(rows[0].value) : 0;
    },

    async incrementInterest() {
      const { rows } = await pool.query(
        `INSERT INTO counters (name, value) VALUES ('interest', 1)
         ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
         RETURNING value`
      );
      return Number(rows[0].value);
    },

    async addApplication(app) {
      const { rows } = await pool.query(
        `INSERT INTO applications (id, name, email, year, message)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), app.name, app.email, app.year, app.message]
      );
      return rows.length ? { id: rows[0].id } : null;
    },

    async listApplications() {
      const { rows } = await pool.query(
        `SELECT id, name, email, year, message, created_at AS "createdAt"
         FROM applications ORDER BY created_at`
      );
      return rows;
    }
  };
}

function createStore({ databaseUrl, dataDir }) {
  return databaseUrl ? createPgStore(databaseUrl) : createFileStore(dataDir);
}

module.exports = { createStore };
