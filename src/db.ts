import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Define the database interfaces
export interface User {
  id: number;
  username: string;
  password_hash?: string;
  clan_id: number | null;
  rounds_played: number;
  wins: number;
}

export interface Clan {
  id: number;
  name: string;
  owner_id: number;
  owner_username?: string;
}

export interface ClanJoinRequest {
  id: number;
  clan_id: number;
  user_id: number;
  username?: string;
  status: 'pending' | 'accepted' | 'denied';
}

const isPostgres = !!process.env.DATABASE_URL;
let pgPool: pg.Pool | null = null;
const LOCAL_DB_PATH = path.resolve(process.cwd(), 'database.json');

// Initialize fallback JSON DB if not using Postgres
interface LocalSchema {
  users: User[];
  clans: Clan[];
  clanJoinRequests: ClanJoinRequest[];
  nextUserId: number;
  nextClanId: number;
  nextRequestId: number;
  clans_legacy?: any[];
  players?: any[];
}

function loadLocalDb(): LocalSchema {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        users: parsed.users || [],
        clans: parsed.clans || [],
        clanJoinRequests: parsed.clanJoinRequests || [],
        nextUserId: parsed.nextUserId || 1,
        nextClanId: parsed.nextClanId || 1,
        nextRequestId: parsed.nextRequestId || 1
      };
    }
  } catch (err) {
    console.error('Error loading local DB, resetting:', err);
  }
  return { users: [], clans: [], clanJoinRequests: [], nextUserId: 1, nextClanId: 1, nextRequestId: 1 };
}

function saveLocalDb(data: LocalSchema) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving local DB:', err);
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function initDb() {
  if (isPostgres) {
    console.log('Connecting to PostgreSQL using DATABASE_URL...');
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false // CRITICAL ARCHITECTURE CONSTRAINT: DATABASE CONNECTION NO SSL (ssl: false inside pg.Pool config)
    });

    const client = await pgPool.connect();
    try {
      // Check if users table is old schema (no password_hash)
      let needReset = false;
      try {
        const colCheck = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'password_hash'
        `);
        if (colCheck.rowCount === 0) {
          const tableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables WHERE table_name = 'users'
          `);
          if (tableCheck.rowCount > 0) {
            needReset = true;
          }
        }
      } catch (e) {
        // ignore
      }

      if (needReset) {
        console.log('Old schema detected. Dropping old tables to reset...');
        await client.query('DROP TABLE IF EXISTS clan_join_requests CASCADE');
        await client.query('DROP TABLE IF EXISTS players CASCADE');
        await client.query('DROP TABLE IF EXISTS clans CASCADE');
        await client.query('DROP TABLE IF EXISTS users CASCADE');
      }

      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          clan_id INTEGER,
          rounds_played INTEGER DEFAULT 0,
          wins INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create clans table
      await client.query(`
        CREATE TABLE IF NOT EXISTS clans (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create clan_join_requests table
      await client.query(`
        CREATE TABLE IF NOT EXISTS clan_join_requests (
          id SERIAL PRIMARY KEY,
          clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(clan_id, user_id)
        );
      `);

      // Add foreign key constraint to users for clan_id if it doesn't exist
      try {
        await client.query(`
          ALTER TABLE users ADD CONSTRAINT fk_user_clan FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE SET NULL;
        `);
      } catch (err) {
        // foreign key might already exist, ignore error
      }

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

export async function getUserByUsername(username: string): Promise<User | null> {
  const trimmed = username.trim().toLowerCase();
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT id, username, password_hash, clan_id, rounds_played, wins FROM users WHERE LOWER(username) = $1', [trimmed]);
      if (res.rows.length > 0) {
        return {
          id: res.rows[0].id,
          username: res.rows[0].username,
          password_hash: res.rows[0].password_hash,
          clan_id: res.rows[0].clan_id,
          rounds_played: res.rows[0].rounds_played,
          wins: res.rows[0].wins
        };
      }
      return null;
    } catch (err) {
      console.error('PostgreSQL getUserByUsername error:', err);
    }
  }
  const db = loadLocalDb();
  const found = db.users?.find(u => u.username.toLowerCase() === trimmed);
  return found || null;
}

export async function registerUser(username: string, passwordHash: string): Promise<User> {
  const trimmed = username.trim();
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, clan_id, rounds_played, wins',
        [trimmed, passwordHash]
      );
      return res.rows[0];
    } catch (err) {
      console.error('PostgreSQL registerUser error:', err);
      throw err;
    }
  }
  const db = loadLocalDb();
  const existing = db.users.find(u => u.username.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    throw new Error('Name bereits vergeben.');
  }
  const newUser: User = {
    id: db.nextUserId++,
    username: trimmed,
    password_hash: passwordHash,
    clan_id: null,
    rounds_played: 0,
    wins: 0
  };
  db.users.push(newUser);
  saveLocalDb(db);
  return newUser;
}

export async function createClan(name: string, ownerId: number): Promise<Clan> {
  const trimmed = name.trim();
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'INSERT INTO clans (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id',
        [trimmed, ownerId]
      );
      // Automatically update owner's clan_id
      await pgPool.query('UPDATE users SET clan_id = $1 WHERE id = $2', [res.rows[0].id, ownerId]);
      return res.rows[0];
    } catch (err) {
      console.error('PostgreSQL createClan error:', err);
      throw err;
    }
  }
  const db = loadLocalDb();
  const existing = db.clans.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    throw new Error('Clan-Name bereits vergeben.');
  }
  const newClan: Clan = {
    id: db.nextClanId++,
    name: trimmed,
    owner_id: ownerId
  };
  db.clans.push(newClan);
  
  // Update owner's clan_id
  const owner = db.users?.find(u => u.id === ownerId);
  if (owner) {
    owner.clan_id = newClan.id;
  }
  saveLocalDb(db);
  return newClan;
}

export async function getClans(): Promise<Clan[]> {
  if (pgPool) {
    try {
      const res = await pgPool.query(`
        SELECT c.id, c.name, c.owner_id, u.username as owner_username 
        FROM clans c
        JOIN users u ON c.owner_id = u.id
        ORDER BY c.name ASC
      `);
      return res.rows;
    } catch (err) {
      console.error('PostgreSQL getClans error:', err);
    }
  }
  const db = loadLocalDb();
  const clansList = db.clans || [];
  return clansList.map(c => {
    const owner = db.users?.find(u => u.id === c.owner_id);
    return {
      ...c,
      owner_username: owner ? owner.username : 'Unbekannt'
    };
  });
}

export async function getClanMembers(clanId: number): Promise<User[]> {
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'SELECT id, username, clan_id, rounds_played, wins FROM users WHERE clan_id = $1 ORDER BY wins DESC, username ASC',
        [clanId]
      );
      return res.rows;
    } catch (err) {
      console.error('PostgreSQL getClanMembers error:', err);
    }
  }
  const db = loadLocalDb();
  const usersList = db.users || [];
  return usersList
    .filter(u => u.clan_id === clanId)
    .sort((a, b) => b.wins - a.wins || a.username.localeCompare(b.username))
    .map(u => ({
      id: u.id,
      username: u.username,
      clan_id: u.clan_id,
      rounds_played: u.rounds_played,
      wins: u.wins
    }));
}

// For legacy code support
export async function getPlayers(clanId: number): Promise<User[]> {
  return getClanMembers(clanId);
}

export async function sendJoinRequest(clanId: number, userId: number): Promise<ClanJoinRequest> {
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'INSERT INTO clan_join_requests (clan_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT (clan_id, user_id) DO UPDATE SET status = EXCLUDED.status RETURNING id, clan_id, user_id, status',
        [clanId, userId, 'pending']
      );
      return res.rows[0];
    } catch (err) {
      console.error('PostgreSQL sendJoinRequest error:', err);
      throw err;
    }
  }
  const db = loadLocalDb();
  if (!db.clanJoinRequests) db.clanJoinRequests = [];
  const existing = db.clanJoinRequests.find(r => r.clan_id === clanId && r.user_id === userId);
  if (existing) {
    existing.status = 'pending';
    saveLocalDb(db);
    return existing;
  }
  const newReq: ClanJoinRequest = {
    id: db.nextRequestId++,
    clan_id: clanId,
    user_id: userId,
    status: 'pending'
  };
  db.clanJoinRequests.push(newReq);
  saveLocalDb(db);
  return newReq;
}

export async function getPendingJoinRequests(clanId: number): Promise<ClanJoinRequest[]> {
  if (pgPool) {
    try {
      const res = await pgPool.query(`
        SELECT r.id, r.clan_id, r.user_id, r.status, u.username 
        FROM clan_join_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.clan_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at ASC
      `, [clanId]);
      return res.rows;
    } catch (err) {
      console.error('PostgreSQL getPendingJoinRequests error:', err);
    }
  }
  const db = loadLocalDb();
  const reqs = db.clanJoinRequests || [];
  return reqs
    .filter(r => r.clan_id === clanId && r.status === 'pending')
    .map(r => {
      const user = db.users?.find(u => u.id === r.user_id);
      return {
        ...r,
        username: user ? user.username : 'Unbekannt'
      };
    });
}

export async function respondToJoinRequest(requestId: number, status: 'accepted' | 'denied'): Promise<void> {
  if (pgPool) {
    try {
      await pgPool.query('UPDATE clan_join_requests SET status = $1 WHERE id = $2', [status, requestId]);
      if (status === 'accepted') {
        const res = await pgPool.query('SELECT clan_id, user_id FROM clan_join_requests WHERE id = $1', [requestId]);
        if (res.rows.length > 0) {
          const { clan_id, user_id } = res.rows[0];
          await pgPool.query('UPDATE users SET clan_id = $1 WHERE id = $2', [clan_id, user_id]);
          // Delete other pending requests for this user as they are now in a clan
          await pgPool.query('DELETE FROM clan_join_requests WHERE user_id = $1 AND status = \'pending\'', [user_id]);
        }
      }
      return;
    } catch (err) {
      console.error('PostgreSQL respondToJoinRequest error:', err);
    }
  }
  const db = loadLocalDb();
  const req = db.clanJoinRequests?.find(r => r.id === requestId);
  if (req) {
    req.status = status;
    if (status === 'accepted') {
      const user = db.users?.find(u => u.id === req.user_id);
      if (user) {
        user.clan_id = req.clan_id;
      }
      // Delete other pending requests for this user
      db.clanJoinRequests = db.clanJoinRequests.filter(r => !(r.user_id === req.user_id && r.status === 'pending' && r.id !== requestId));
    }
    saveLocalDb(db);
  }
}

export async function recordGameResult(clanId: number, winnerUsername: string, allUsernames: string[]) {
  if (pgPool) {
    try {
      // Increment rounds_played for all active players in this game
      for (const username of allUsernames) {
        await pgPool.query(
          'UPDATE users SET rounds_played = rounds_played + 1 WHERE LOWER(username) = LOWER($1)',
          [username.trim()]
        );
      }
      // Increment wins for the winner
      await pgPool.query(
        'UPDATE users SET wins = wins + 1 WHERE LOWER(username) = LOWER($1)',
        [winnerUsername.trim()]
      );
      return;
    } catch (err) {
      console.error('PostgreSQL recordGameResult error:', err);
    }
  }

  const db = loadLocalDb();
  for (const username of allUsernames) {
    const user = db.users?.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (user) {
      user.rounds_played += 1;
      if (username.trim().toLowerCase() === winnerUsername.trim().toLowerCase()) {
        user.wins += 1;
      }
    }
  }
  saveLocalDb(db);
}
