import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Define the database interfaces
export interface Clan {
  id: number;
  name: string;
}

export interface Player {
  id: number;
  name: string;
  clan_id: number;
  rounds_played: number;
  wins: number;
}

const isPostgres = !!process.env.DATABASE_URL;
let pgPool: pg.Pool | null = null;
const LOCAL_DB_PATH = path.resolve(process.cwd(), 'database.json');

// Initialize fallback JSON DB if not using Postgres
interface LocalSchema {
  clans: Clan[];
  players: Player[];
  nextClanId: number;
  nextPlayerId: number;
}

function loadLocalDb(): LocalSchema {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading local DB, resetting:', err);
  }
  return { clans: [], players: [], nextClanId: 1, nextPlayerId: 1 };
}

function saveLocalDb(data: LocalSchema) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving local DB:', err);
  }
}

export async function initDb() {
  if (isPostgres) {
    console.log('Connecting to PostgreSQL using DATABASE_URL...');
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    });

    // Create tables
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS clans (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
          rounds_played INTEGER DEFAULT 0,
          wins INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(clan_id, name)
        );
      `);
      console.log('PostgreSQL tables verified/created successfully.');
    } catch (err) {
      console.error('Failed to initialize PostgreSQL tables, falling back to local storage:', err);
      pgPool = null;
    } finally {
      client.release();
    }
  } else {
    console.log('DATABASE_URL not found. Using local JSON database (database.json)...');
    const data = loadLocalDb();
    saveLocalDb(data);
  }
}

export async function getClans(): Promise<Clan[]> {
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT id, name FROM clans ORDER BY name ASC');
      return res.rows;
    } catch (err) {
      console.error('PostgreSQL getClans error:', err);
    }
  }
  return loadLocalDb().clans;
}

export async function createClan(name: string): Promise<Clan> {
  const trimmed = name.trim();
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'INSERT INTO clans (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name',
        [trimmed]
      );
      return res.rows[0];
    } catch (err) {
      console.error('PostgreSQL createClan error:', err);
    }
  }

  const db = loadLocalDb();
  const existing = db.clans.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;

  const newClan: Clan = { id: db.nextClanId++, name: trimmed };
  db.clans.push(newClan);
  saveLocalDb(db);
  return newClan;
}

export async function getPlayers(clanId: number): Promise<Player[]> {
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'SELECT id, name, clan_id, rounds_played, wins FROM players WHERE clan_id = $1 ORDER BY wins DESC, name ASC',
        [clanId]
      );
      return res.rows;
    } catch (err) {
      console.error('PostgreSQL getPlayers error:', err);
    }
  }
  const db = loadLocalDb();
  return db.players.filter(p => p.clan_id === clanId).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
}

export async function addPlayer(clanId: number, name: string): Promise<Player> {
  const trimmed = name.trim();
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'INSERT INTO players (clan_id, name) VALUES ($1, $2) ON CONFLICT (clan_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, clan_id, rounds_played, wins',
        [clanId, trimmed]
      );
      return res.rows[0];
    } catch (err) {
      console.error('PostgreSQL addPlayer error:', err);
    }
  }

  const db = loadLocalDb();
  const existing = db.players.find(p => p.clan_id === clanId && p.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;

  const newPlayer: Player = {
    id: db.nextPlayerId++,
    name: trimmed,
    clan_id: clanId,
    rounds_played: 0,
    wins: 0
  };
  db.players.push(newPlayer);
  saveLocalDb(db);
  return newPlayer;
}

export async function recordGameResult(clanId: number, winnerName: string, allPlayerNames: string[]) {
  if (pgPool) {
    try {
      // Increment rounds_played for all active players in this game
      for (const name of allPlayerNames) {
        await pgPool.query(
          'INSERT INTO players (clan_id, name, rounds_played) VALUES ($1, $2, 1) ON CONFLICT (clan_id, name) DO UPDATE SET rounds_played = players.rounds_played + 1',
          [clanId, name.trim()]
        );
      }
      // Increment wins for the winner
      await pgPool.query(
        'UPDATE players SET wins = wins + 1 WHERE clan_id = $1 AND name = $2',
        [clanId, winnerName.trim()]
      );
      return;
    } catch (err) {
      console.error('PostgreSQL recordGameResult error:', err);
    }
  }

  const db = loadLocalDb();
  // Ensure players exist and increment
  for (const name of allPlayerNames) {
    const trimmed = name.trim();
    let player = db.players.find(p => p.clan_id === clanId && p.name.toLowerCase() === trimmed.toLowerCase());
    if (!player) {
      player = {
        id: db.nextPlayerId++,
        name: trimmed,
        clan_id: clanId,
        rounds_played: 0,
        wins: 0
      };
      db.players.push(player);
    }
    player.rounds_played += 1;
    if (trimmed.toLowerCase() === winnerName.trim().toLowerCase()) {
      player.wins += 1;
    }
  }
  saveLocalDb(db);
}
