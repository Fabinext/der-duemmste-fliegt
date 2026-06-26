import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

// Load environment variables
dotenv.config();

import { 
  initDb, 
  getClans, 
  createClan, 
  getClanMembers, 
  getUserByUsername, 
  registerUser, 
  sendJoinRequest, 
  getPendingJoinRequests, 
  respondToJoinRequest, 
  recordGameResult,
  hashPassword 
} from './src/db.ts';
import { PRESET_QUESTIONS, TriviaQuestion } from './src/questions.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

// Game Room interface definitions
interface RoundQuestionHistory {
  question: string;
  correctAnswer: string;
  isCorrect: boolean;
}

interface GamePlayer {
  name: string;
  lives: number;
  swimLifeUsed: boolean;
  isEliminated: boolean;
  score: number; // Correct answers in current round
  totalCorrect: number;
  totalQuestions: number;
  votedFor: string | null;
  deviceId: string | null; // For mobile players
  roundQuestionsAsked?: number;
  roundHistory?: RoundQuestionHistory[];
  authUsername?: string | null;
}

interface GameRoom {
  roomCode: string;
  gmSessionId: string;
  status: 'lobby' | 'settings' | 'round' | 'summary' | 'voting' | 'tiebreaker' | 'finale' | 'ended';
  players: GamePlayer[];
  settings: {
    lives: number;
    swimLife: boolean;
    cycleCount: number;
    gameMode: 'lobby' | 'local';
    clanId: number | null;
    geminiApiKey: string;
    useAiQuestions?: boolean;
    finaleAdvantage?: boolean;
  };
  currentRound: number;
  activePlayerIndex: number;
  currentPlayerQuestionCount: number;
  currentQuestion: TriviaQuestion | null;
  currentQuestionActiveAt?: number | null;
  questionsUsed: number[];
  aiQuestionsUsed?: string[];
  votes: Record<string, number>;
  tiePlayers: string[];
  tieBreakerResolved: boolean;
  finaleQuestions: TriviaQuestion[];
  finaleScores: Record<string, number[]>; // PlayerName -> array of 20 numbers (1: correct, 0: wrong, -1: pending)
  finaleActivePlayer: string | null;
  finaleQuestionIndex: number;
  winner: string | null;
  lastUpdated: number;
  finaleGivenAnswers?: Record<string, string[]>;
}

// In-memory active rooms
const rooms = new Map<string, GameRoom>();

// Generate a random 4-letter room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Get a random question from the preset list
function getRandomPresetQuestion(category: string, excludedIds: number[]): TriviaQuestion {
  let filtered = PRESET_QUESTIONS.filter(q => !excludedIds.includes(q.id));
  if (category && category !== 'Zufall') {
    const catFiltered = filtered.filter(q => q.category.toLowerCase() === category.toLowerCase());
    if (catFiltered.length > 0) filtered = catFiltered;
  }
  if (filtered.length === 0) {
    // If all questions used, reset exclusions for this request
    filtered = PRESET_QUESTIONS;
  }
  return filtered[Math.floor(Math.random() * filtered.length)];
}

// Generate question using Gemini API
async function generateGeminiQuestion(apiKey: string, category: string, excludedQuestions: string[] = []): Promise<{ question: string; answer: string }> {
  try {
    const keyToUse = apiKey || process.env.GEMINI_API_KEY;
    if (!keyToUse) {
      throw new Error('No API key provided');
    }

    const ai = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const randomCategories = ['Allgemeinwissen', 'Popkultur', 'Geografie', 'Gaming', 'Trivia'];
    const categoryPrompt = category && category !== 'Zufall' 
      ? category 
      : randomCategories[Math.floor(Math.random() * randomCategories.length)];

    let exclusionInstruction = '';
    if (excludedQuestions && excludedQuestions.length > 0) {
      exclusionInstruction = `\nDie folgende(n) Frage(n) wurden bereits gestellt und dürfen auf KEINEN FALL verwendet, wiederholt oder ähnlich formuliert werden:\n${excludedQuestions.map(q => `- ${q}`).join('\n')}\nGeneriere eine komplett andere Frage.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generiere eine anspruchsvolle und unterhaltsame Trivia-Quizfrage auf Deutsch für die Kategorie "${categoryPrompt}". 

Regeln für die Generierung:
1. Die exakte Antwort darf unter keinen Umständen im Text der Frage vorkommen (auch nicht in abgewandelter Form).
2. Stelle sicher, dass die Antwort historisch und wissenschaftlich zu 100% korrekt und eindeutig bewiesen ist.
3. Verwende korrekte deutsche Rechtschreibung und Umlaute (ä, ö, ü, ß). Keine Sonderzeichen verfälschen (nicht "lteste" sondern "älteste").
4. Die Frage muss präzise sein und eine kurze, eindeutige Antwort haben (maximal 1 bis 3 Wörter).${exclusionInstruction}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: {
              type: Type.STRING,
              description: 'Die Quizfrage auf Deutsch.'
            },
            answer: {
              type: Type.STRING,
              description: 'Die exakte, kurze Antwort auf Deutsch (1-3 Wörter).'
            }
          },
          required: ['question', 'answer']
        }
      }
    });

    const text = response.text || '';
    const parsed = JSON.parse(text);
    if (parsed.question && parsed.answer) {
      return {
        question: parsed.question,
        answer: parsed.answer
      };
    }
    throw new Error('Invalid Gemini output format');
  } catch (err) {
    console.warn('Gemini API is currently unavailable or experiencing high demand. Falling back to built-in presets gracefully.', err);
    throw err;
  }
}

// Clean up old rooms (older than 4 hours) periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastUpdated > 4 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

// API: AUTHENTICATION
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ error: 'Name und Passwort dürfen nicht leer sein.' });
  }
  const nameTrimmed = username.trim();
  if (nameTrimmed.length < 3 || nameTrimmed.length > 16) {
    return res.status(400).json({ error: 'Der Name muss zwischen 3 und 16 Zeichen lang sein.' });
  }

  try {
    const existing = await getUserByUsername(nameTrimmed);
    if (existing) {
      return res.status(400).json({ error: 'Name ist bereits vergeben.' });
    }
    const hash = hashPassword(password);
    const user = await registerUser(nameTrimmed, hash);
    res.json({ success: true, user: { id: user.id, username: user.username, clanId: user.clan_id } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registrierung fehlgeschlagen.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ error: 'Name und Passwort erforderlich.' });
  }

  try {
    const user = await getUserByUsername(username.trim());
    if (!user) {
      return res.status(400).json({ error: 'Ungültiger Name oder Passwort.' });
    }
    const hash = hashPassword(password);
    if (user.password_hash !== hash) {
      return res.status(400).json({ error: 'Ungültiger Name oder Passwort.' });
    }
    res.json({ success: true, user: { id: user.id, username: user.username, clanId: user.clan_id } });
  } catch (err) {
    res.status(500).json({ error: 'Login fehlgeschlagen.' });
  }
});

const activeVisitors = new Map<string, number>();

app.get('/api/online-count', (req, res) => {
  const visitorId = (req.query.visitorId as string) || 'anonymous';
  activeVisitors.set(visitorId, Date.now());

  // Clean up stale visitors (inactive for > 10 seconds)
  const now = Date.now();
  for (const [id, lastSeen] of activeVisitors.entries()) {
    if (now - lastSeen > 10000) {
      activeVisitors.delete(id);
    }
  }

  res.json({ count: Math.max(1, activeVisitors.size) });
});

app.post('/api/test-gemini-key', async (req, res) => {
  const { apiKey } = req.body;
  const keyToUse = apiKey || process.env.GEMINI_API_KEY;

  if (!keyToUse || !keyToUse.trim()) {
    return res.status(400).json({ error: 'Kein API-Key angegeben.' });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: keyToUse.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Reagiere mit dem Wort: OK',
    });

    if (response && response.text) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false, error: 'Leere Antwort von der KI erhalten.' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Verbindung zu Gemini fehlgeschlagen.' });
  }
});

app.get('/api/auth/me/:username', async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    res.json({ id: user.id, username: user.username, clanId: user.clan_id });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Abrufen des Benutzerstatus.' });
  }
});

// API: CLANS & LEADERS
app.get('/api/clans', async (req, res) => {
  try {
    const clans = await getClans();
    res.json(clans);
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden der Clans' });
  }
});

app.post('/api/clans', async (req, res) => {
  try {
    const { name, ownerId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Clan-Name darf nicht leer sein.' });
    }
    if (!ownerId) {
      return res.status(400).json({ error: 'Besitzer-ID erforderlich.' });
    }
    const clan = await createClan(name, ownerId);
    res.json(clan);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Fehler beim Erstellen des Clans' });
  }
});

app.get('/api/clans/:clanId/players', async (req, res) => {
  try {
    const clanId = parseInt(req.params.clanId, 10);
    const members = await getClanMembers(clanId);
    res.json(members.map(m => ({
      id: m.id,
      name: m.username,
      clan_id: m.clan_id,
      rounds_played: m.rounds_played,
      wins: m.wins
    })));
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden der Clan-Mitglieder' });
  }
});

// API: CLAN JOIN REQUESTS
app.post('/api/clans/:clanId/join-request', async (req, res) => {
  try {
    const clanId = parseInt(req.params.clanId, 10);
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Benutzer-ID erforderlich.' });
    }
    const request = await sendJoinRequest(clanId, userId);
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: 'Beitrittsanfrage konnte nicht gesendet werden.' });
  }
});

app.get('/api/clans/:clanId/requests', async (req, res) => {
  try {
    const clanId = parseInt(req.params.clanId, 10);
    const requests = await getPendingJoinRequests(clanId);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden der Beitrittsanfragen.' });
  }
});

app.post('/api/clans/:clanId/requests/:requestId', async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const { action } = req.body; // 'accepted' or 'denied'
    if (action !== 'accepted' && action !== 'denied') {
      return res.status(400).json({ error: 'Ungültige Aktion.' });
    }
    await respondToJoinRequest(requestId, action);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Bearbeiten der Anfrage.' });
  }
});

// API: GAME ROOM MANAGEMENT
app.post('/api/room/create', (req, res) => {
  const { gameMode } = req.body || {};
  const requestedMode = (gameMode === 'lobby' || gameMode === 'local') ? gameMode : 'local';

  const roomCode = generateRoomCode();
  const gmSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const newRoom: GameRoom = {
    roomCode,
    gmSessionId,
    status: 'lobby',
    players: [],
    settings: {
      lives: 3,
      swimLife: true,
      cycleCount: 2,
      gameMode: requestedMode,
      clanId: null,
      geminiApiKey: '',
      useAiQuestions: false,
      finaleAdvantage: true
    },
    currentRound: 1,
    activePlayerIndex: 0,
    currentPlayerQuestionCount: 0,
    currentQuestion: null,
    currentQuestionActiveAt: null,
    questionsUsed: [],
    aiQuestionsUsed: [],
    votes: {},
    tiePlayers: [],
    tieBreakerResolved: false,
    finaleQuestions: [],
    finaleScores: {},
    finaleGivenAnswers: {},
    finaleActivePlayer: null,
    finaleQuestionIndex: 0,
    winner: null,
    lastUpdated: Date.now()
  };

  rooms.set(roomCode, newRoom);
  res.json({ roomCode, gmSessionId });
});

// Get player-safe room status
app.get('/api/room/:roomCode', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Raum nicht gefunden.' });
  }

  // Sanitize full state for players to avoid leaks
  const sanitizedPlayers = room.players.map(p => ({
    name: p.name,
    lives: p.lives,
    isEliminated: p.isEliminated,
    votedFor: p.votedFor,
    score: p.score,
    roundQuestionsAsked: p.roundQuestionsAsked || 0,
    roundHistory: p.roundHistory || []
  }));

  res.json({
    roomCode: room.roomCode,
    status: room.status,
    players: sanitizedPlayers,
    settings: {
      gameMode: room.settings.gameMode,
      lives: room.settings.lives,
      swimLife: room.settings.swimLife,
      useAiQuestions: room.settings.useAiQuestions,
      finaleAdvantage: room.settings.finaleAdvantage !== false
    },
    currentRound: room.currentRound,
    tiePlayers: room.tiePlayers,
    winner: room.winner,
    lastUpdated: room.lastUpdated,
    currentQuestion: room.currentQuestion ? { question: room.currentQuestion.question } : null,
    currentQuestionActiveAt: room.currentQuestionActiveAt || null,
    activePlayerName: room.status === 'finale' ? room.finaleActivePlayer : (room.players[room.activePlayerIndex]?.name || null),
    finaleQuestionIndex: room.finaleQuestionIndex,
    finaleScores: room.finaleScores,
    finaleGivenAnswers: room.finaleGivenAnswers || null
  });
});

// Get GM-privileged full room status
app.get('/api/room/:roomCode/gm', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const token = req.query.token as string;
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Raum nicht gefunden.' });
  }
  if (room.gmSessionId !== token) {
    return res.status(403).json({ error: 'Ungültige GM-Session.' });
  }

  res.json(room);
});

// Mobile join endpoint
app.post('/api/room/:roomCode/join', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const { name, deviceId, authUsername } = req.body;

  const room = rooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Raum nicht gefunden.' });
  }
  if (room.status !== 'lobby') {
    return res.status(400).json({ error: 'Beitritt nur in der Lobby möglich.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Spielername darf nicht leer sein.' });
  }

  const trimmedName = name.trim().substring(0, 16);
  const exists = room.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Name bereits vergeben.' });
  }

  const newPlayer: GamePlayer = {
    name: trimmedName,
    lives: room.settings.lives,
    swimLifeUsed: false,
    isEliminated: false,
    score: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    votedFor: null,
    deviceId: deviceId || null,
    roundQuestionsAsked: 0,
    roundHistory: [],
    authUsername: authUsername || null
  };

  room.players.push(newPlayer);
  room.lastUpdated = Date.now();
  res.json({ success: true, name: trimmedName });
});

// Mobile vote submission
app.post('/api/room/:roomCode/vote', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const { voterName, votedForName, deviceId } = req.body;

  const room = rooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Raum nicht gefunden.' });
  }
  if (room.status !== 'voting') {
    return res.status(400).json({ error: 'Aktuell läuft keine Abstimmungsphase.' });
  }

  const voter = room.players.find(p => p.name === voterName);
  if (!voter) {
    return res.status(400).json({ error: 'Wähler nicht im Raum gefunden.' });
  }
  if (voter.isEliminated) {
    return res.status(400).json({ error: 'Eliminierte Spieler können nicht abstimmen.' });
  }
  if (voterName === votedForName) {
    return res.status(400).json({ error: 'Du kannst nicht für dich selbst abstimmen!' });
  }

  const votedFor = room.players.find(p => p.name === votedForName);
  if (!votedFor) {
    return res.status(400).json({ error: 'Gewählter Spieler existiert nicht.' });
  }

  voter.votedFor = votedForName;
  room.lastUpdated = Date.now();

  // Check if all active (non-eliminated) players have voted
  const activePlayers = room.players.filter(p => !p.isEliminated);
  const allVoted = activePlayers.every(p => p.votedFor !== null);

  if (allVoted) {
    // Process votes immediately but do not transition or eliminate player automatically yet.
    // This allows the GM screen to show the final results and click "Resolve" manually.
    const voteCounts: Record<string, number> = {};
    activePlayers.forEach(p => {
      if (p.votedFor) {
        voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
      }
    });

    room.votes = voteCounts;
  }

  res.json({ success: true });
});

// Helper: Handle player elimination & swim life rules
function eliminatePlayer(room: GameRoom, name: string) {
  const p = room.players.find(player => player.name === name);
  if (!p) return;

  const wasEliminatedBefore = p.isEliminated;
  p.lives -= 1;

  // Swim-life rule: First player to reach 0 lives gets 1 bonus life instead of instant elimination
  if (room.settings.swimLife && p.lives <= 0 && !p.swimLifeUsed) {
    // Check if they are truly the first player to hit 0 lives
    const otherSwimLifeUsed = room.players.some(other => other.name !== name && other.swimLifeUsed);
    if (!otherSwimLifeUsed) {
      p.lives = 1;
      p.swimLifeUsed = true;
      // Note: Player stays in play but gets swim life bonus
    } else {
      p.isEliminated = true;
    }
  } else if (p.lives <= 0) {
    p.isEliminated = true;
  }

  // Count active players
  const remaining = room.players.filter(player => !player.isEliminated);

  if (p.isEliminated && !wasEliminatedBefore && remaining.length === 2) {
    // Finalists reached because a player was fully eliminated
    room.status = 'finale';
    setupFinale(room);
  } else if (remaining.length === 1) {
    // Only one player remains - they win!
    room.status = 'ended';
    room.winner = remaining[0].name;
    
    // Save to persistent database if clan is selected
    if (room.settings.clanId) {
      const winnerPlayer = room.players.find(pl => pl.name === room.winner);
      const winnerName = winnerPlayer?.authUsername || room.winner;
      const allNames = room.players.map(pl => pl.authUsername || pl.name);
      recordGameResult(room.settings.clanId, winnerName, allNames).catch(console.error);
    }
  } else {
    // Next round setup - keep playing rounds
    room.currentRound += 1;
    room.status = 'round';
    setupRoundCircle(room);
  }
}

function setupRoundCircle(room: GameRoom) {
  // Reset round scores
  room.players.forEach(p => {
    p.score = 0;
    p.votedFor = null;
    p.roundQuestionsAsked = 0;
    p.roundHistory = [];
  });
  room.votes = {};
  room.tiePlayers = [];
  room.tieBreakerResolved = false;

  // Determine starting player (first non-eliminated player)
  const firstActiveIndex = room.players.findIndex(p => !p.isEliminated);
  room.activePlayerIndex = firstActiveIndex >= 0 ? firstActiveIndex : 0;
  room.currentPlayerQuestionCount = 0;
  room.currentQuestion = null;
}

function setupFinale(room: GameRoom) {
  const active = room.players.filter(p => !p.isEliminated);
  if (active.length < 2) {
    room.status = 'ended';
    room.winner = active[0]?.name || room.players[0]?.name || null;
    return;
  }

  // Select 20 identical questions for the finale
  const selectedQuestions: TriviaQuestion[] = [];
  const tempUsedIds = [...room.questionsUsed];

  for (let i = 0; i < 20; i++) {
    const q = getRandomPresetQuestion('Zufall', tempUsedIds);
    selectedQuestions.push(q);
    tempUsedIds.push(q.id);
  }

  room.finaleQuestions = selectedQuestions;
  room.finaleScores = {};
  room.finaleGivenAnswers = {};
  active.forEach(p => {
    room.finaleScores[p.name] = Array(20).fill(-1); // -1 means pending
    room.finaleGivenAnswers![p.name] = Array(20).fill('');
  });

  // Calculate lives difference
  const p1 = active[0];
  const p2 = active[1];
  let p1Advantage = 0;
  let p2Advantage = 0;

  if (room.settings.finaleAdvantage !== false) {
    const diff = Math.abs(p1.lives - p2.lives);
    if (diff > 0) {
      if (p1.lives > p2.lives) {
        p1Advantage = diff;
      } else {
        p2Advantage = diff;
      }
    }
  }

  // Set advantages in the score arrays
  if (p1Advantage > 0) {
    for (let i = 0; i < p1Advantage; i++) {
      room.finaleScores[p1.name][i] = 1; // Pre-filled correct answers
    }
  }
  if (p2Advantage > 0) {
    for (let i = 0; i < p2Advantage; i++) {
      room.finaleScores[p2.name][i] = 1; // Pre-filled correct answers
    }
  }

  room.finaleActivePlayer = p1.name;
  room.finaleQuestionIndex = p1Advantage;
  room.currentQuestion = room.finaleQuestions[p1Advantage] || null;
  room.currentQuestionActiveAt = null;
}

// API: GM ACTIONS
app.post('/api/room/:roomCode/action', async (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const { action, payload, token } = req.body;

  const room = rooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Raum nicht gefunden.' });
  }
  if (room.gmSessionId !== token) {
    return res.status(403).json({ error: 'Ungültige GM-Session.' });
  }

  room.lastUpdated = Date.now();

  try {
    switch (action) {
      case 'updateSettings': {
        const { lives, swimLife, cycleCount, gameMode, clanId, geminiApiKey, useAiQuestions, finaleAdvantage } = payload;
        room.settings = {
          lives: parseInt(lives, 10) || 3,
          swimLife: !!swimLife,
          cycleCount: parseInt(cycleCount, 10) || 2,
          gameMode: gameMode === 'lobby' ? 'lobby' : 'local',
          clanId: clanId ? parseInt(clanId, 10) : null,
          geminiApiKey: geminiApiKey || '',
          useAiQuestions: !!useAiQuestions,
          finaleAdvantage: finaleAdvantage === undefined ? true : !!finaleAdvantage
        };

        // Reset players lives if setting changed before round started
        if (room.status === 'lobby') {
          room.players.forEach(p => {
            p.lives = room.settings.lives;
          });
        }
        break;
      }

      case 'addLocalPlayer': {
        if (room.status !== 'lobby') {
          return res.status(400).json({ error: 'Spieler können nur in der Lobby hinzugefügt werden.' });
        }
        const { name } = payload;
        if (!name || !name.trim()) {
          return res.status(400).json({ error: 'Spielername darf nicht leer sein.' });
        }
        const trimmed = name.trim().substring(0, 16);
        if (room.players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
          return res.status(400).json({ error: 'Name bereits vergeben.' });
        }
        room.players.push({
          name: trimmed,
          lives: room.settings.lives,
          swimLifeUsed: false,
          isEliminated: false,
          score: 0,
          totalCorrect: 0,
          totalQuestions: 0,
          votedFor: null,
          deviceId: null
        });
        break;
      }

      case 'removePlayer': {
        const { name } = payload;
        room.players = room.players.filter(p => p.name !== name);
        break;
      }

      case 'startGame': {
        if (room.players.length < 2) {
          return res.status(400).json({ error: 'Mindestens 2 Spieler erforderlich.' });
        }
        room.status = 'round';
        room.currentRound = 1;
        setupRoundCircle(room);
        break;
      }

      case 'getQuestion': {
        if (room.status === 'finale') {
          room.currentQuestion = room.finaleQuestions[room.finaleQuestionIndex];
          room.currentQuestionActiveAt = null;
          break;
        }
        const { category } = payload;
        if (room.settings.useAiQuestions && (room.settings.geminiApiKey || process.env.GEMINI_API_KEY)) {
          try {
            const geminiResult = await generateGeminiQuestion(room.settings.geminiApiKey, category, room.aiQuestionsUsed || []);
            const questionObj: TriviaQuestion = {
              id: -Math.floor(Math.random() * 100000), // unique negative id for generated questions
              category: category || 'AI',
              question: geminiResult.question,
              answer: geminiResult.answer,
              source: 'ai'
            };
            if (!room.aiQuestionsUsed) room.aiQuestionsUsed = [];
            room.aiQuestionsUsed.push(geminiResult.question);
            room.currentQuestion = questionObj;
            room.currentQuestionActiveAt = Date.now();
            return res.json(room);
          } catch (err) {
            // fallback below
          }
        }
        // Fallback to presets
        const presetQ = getRandomPresetQuestion(category, room.questionsUsed);
        room.questionsUsed.push(presetQ.id);
        room.currentQuestion = { ...presetQ, source: 'preset' };
        room.currentQuestionActiveAt = Date.now();
        break;
      }

      case 'rerollQuestion': {
        if (room.status === 'finale') {
          if (room.settings.useAiQuestions && (room.settings.geminiApiKey || process.env.GEMINI_API_KEY)) {
            try {
              const geminiResult = await generateGeminiQuestion(room.settings.geminiApiKey, 'Zufall', room.aiQuestionsUsed || []);
              const newQ: TriviaQuestion = {
                id: -Math.floor(Math.random() * 100000),
                category: 'Zufall',
                question: geminiResult.question,
                answer: geminiResult.answer,
                source: 'ai'
              };
              if (!room.aiQuestionsUsed) room.aiQuestionsUsed = [];
              room.aiQuestionsUsed.push(geminiResult.question);
              room.finaleQuestions[room.finaleQuestionIndex] = newQ;
              room.currentQuestion = newQ;
              room.currentQuestionActiveAt = null;
              return res.json(room);
            } catch (err) {
              // fallback below
            }
          }
          // fallback presets
          const presetQ = getRandomPresetQuestion('Zufall', room.questionsUsed);
          room.questionsUsed.push(presetQ.id);
          const newQ: TriviaQuestion = { ...presetQ, source: 'preset' };
          room.finaleQuestions[room.finaleQuestionIndex] = newQ;
          room.currentQuestion = newQ;
          room.currentQuestionActiveAt = null;
          break;
        }

        const { category } = payload || { category: 'Zufall' };
        const cat = category || 'Zufall';
        if (room.settings.useAiQuestions && (room.settings.geminiApiKey || process.env.GEMINI_API_KEY)) {
          try {
            const geminiResult = await generateGeminiQuestion(room.settings.geminiApiKey, cat, room.aiQuestionsUsed || []);
            const questionObj: TriviaQuestion = {
              id: -Math.floor(Math.random() * 100000),
              category: cat || 'AI',
              question: geminiResult.question,
              answer: geminiResult.answer,
              source: 'ai'
            };
            if (!room.aiQuestionsUsed) room.aiQuestionsUsed = [];
            room.aiQuestionsUsed.push(geminiResult.question);
            room.currentQuestion = questionObj;
            room.currentQuestionActiveAt = Date.now();
            return res.json(room);
          } catch (err) {
            // fallback below
          }
        }
        // Fallback to presets
        const presetQ = getRandomPresetQuestion(cat, room.questionsUsed);
        room.questionsUsed.push(presetQ.id);
        room.currentQuestion = { ...presetQ, source: 'preset' };
        room.currentQuestionActiveAt = Date.now();
        break;
      }

      case 'submitAnswer': {
        const { isCorrect, isTimeout } = payload;
        if (room.status === 'round') {
          const activePlayer = room.players[room.activePlayerIndex];
          activePlayer.totalQuestions += 1;
          activePlayer.roundQuestionsAsked = (activePlayer.roundQuestionsAsked || 0) + 1;
          if (isCorrect) {
            activePlayer.score += 1;
            activePlayer.totalCorrect += 1;
          }

          if (room.currentQuestion) {
            if (!activePlayer.roundHistory) {
              activePlayer.roundHistory = [];
            }
            activePlayer.roundHistory.push({
              question: room.currentQuestion.question,
              correctAnswer: room.currentQuestion.answer,
              isCorrect: isCorrect
            });
          }

          // Find next player in round-robin fashion
          let foundNext = false;
          let nextIndex = (room.activePlayerIndex + 1) % room.players.length;
          
          for (let i = 0; i < room.players.length; i++) {
            const p = room.players[nextIndex];
            if (!p.isEliminated && (p.roundQuestionsAsked || 0) < room.settings.cycleCount) {
              room.activePlayerIndex = nextIndex;
              foundNext = true;
              break;
            }
            nextIndex = (nextIndex + 1) % room.players.length;
          }

          if (!foundNext) {
            // Entire round-robin is completed. Transition to round summary.
            room.status = 'summary';
            room.currentQuestion = null;
            room.currentQuestionActiveAt = null;
            room.currentPlayerQuestionCount = 0;
          } else {
            // Next player gets new question directly and instantly!
            room.currentPlayerQuestionCount = room.players[room.activePlayerIndex].roundQuestionsAsked || 0;
            
            let nextQ: TriviaQuestion | null = null;
            if (room.settings.useAiQuestions && (room.settings.geminiApiKey || process.env.GEMINI_API_KEY)) {
              try {
                const geminiResult = await generateGeminiQuestion(room.settings.geminiApiKey, 'Zufall', room.aiQuestionsUsed || []);
                nextQ = {
                  id: -Math.floor(Math.random() * 100000),
                  category: 'Zufall',
                  question: geminiResult.question,
                  answer: geminiResult.answer,
                  source: 'ai'
                };
                if (!room.aiQuestionsUsed) room.aiQuestionsUsed = [];
                room.aiQuestionsUsed.push(geminiResult.question);
              } catch (err) {
                // fallback
              }
            }

            if (!nextQ) {
              const presetQ = getRandomPresetQuestion('Zufall', room.questionsUsed);
              room.questionsUsed.push(presetQ.id);
              nextQ = { ...presetQ, source: 'preset' };
            }

            room.currentQuestion = nextQ;
            room.currentQuestionActiveAt = Date.now();
          }
        } else if (room.status === 'finale') {
          const activeName = room.finaleActivePlayer;
          if (!activeName) break;

          const scores = room.finaleScores[activeName];
          const isTimeoutVal = isTimeout === true;
          const { givenAnswer } = payload || {};

          if (isTimeoutVal) {
            // Mark current question as wrong
            scores[room.finaleQuestionIndex] = 0;
            if (room.finaleGivenAnswers) {
              if (!room.finaleGivenAnswers[activeName]) {
                room.finaleGivenAnswers[activeName] = Array(20).fill('');
              }
              room.finaleGivenAnswers[activeName][room.finaleQuestionIndex] = givenAnswer || 'Zeit abgelaufen';
            }
            
            // Mark next question as wrong too, if there is one
            if (room.finaleQuestionIndex + 1 < 20) {
              scores[room.finaleQuestionIndex + 1] = 0;
              if (room.finaleGivenAnswers) {
                if (!room.finaleGivenAnswers[activeName]) {
                  room.finaleGivenAnswers[activeName] = Array(20).fill('');
                }
                room.finaleGivenAnswers[activeName][room.finaleQuestionIndex + 1] = 'Übersprungen wegen Zeitspiel';
              }
              room.finaleQuestionIndex += 2;
            } else {
              room.finaleQuestionIndex += 1;
            }
          } else {
            scores[room.finaleQuestionIndex] = isCorrect ? 1 : 0;
            if (!isCorrect && room.finaleGivenAnswers) {
              if (!room.finaleGivenAnswers[activeName]) {
                room.finaleGivenAnswers[activeName] = Array(20).fill('');
              }
              room.finaleGivenAnswers[activeName][room.finaleQuestionIndex] = givenAnswer || '';
            }
            room.finaleQuestionIndex += 1;
          }

          // Move to next question or switch player
          if (room.finaleQuestionIndex < 20) {
            room.currentQuestion = room.finaleQuestions[room.finaleQuestionIndex] || null;
            room.currentQuestionActiveAt = null;
          } else {
            // Check if there is a second player who hasn't played yet
            const activeFinalists = room.players.filter(p => !p.isEliminated);
            const playerIndex = activeFinalists.findIndex(p => p.name === activeName);

            if (playerIndex === 0 && activeFinalists[1]) {
              // Switch to player 2
              const p1 = activeFinalists[0];
              const p2 = activeFinalists[1];
              let p2Adv = 0;
              if (room.settings.finaleAdvantage !== false) {
                const diff = Math.abs(p1.lives - p2.lives);
                if (diff > 0 && p2.lives > p1.lives) {
                  p2Adv = diff;
                }
              }
              room.finaleActivePlayer = p2.name;
              room.finaleQuestionIndex = p2Adv;
              room.currentQuestion = room.finaleQuestions[room.finaleQuestionIndex] || null;
              room.currentQuestionActiveAt = null;
            } else {
              // Both players finished their 20 questions! Determine the winner
              room.status = 'ended';
              room.currentQuestion = null;
              room.currentQuestionActiveAt = null;

              const p1Name = activeFinalists[0].name;
              const p2Name = activeFinalists[1].name;

              const p1Correct = room.finaleScores[p1Name].filter(s => s === 1).length;
              const p2Correct = room.finaleScores[p2Name].filter(s => s === 1).length;

              if (p1Correct > p2Correct) {
                room.winner = p1Name;
              } else if (p2Correct > p1Correct) {
                room.winner = p2Name;
              } else {
                // If draw, the one with more overall total correct answers wins, or p1 wins
                const p1Overall = activeFinalists[0].totalCorrect;
                const p2Overall = activeFinalists[1].totalCorrect;
                if (p1Overall > p2Overall) {
                  room.winner = p1Name;
                } else {
                  room.winner = p2Name;
                }
              }

              // Save to persistent database (Leaderboard) if clan is selected!
              if (room.settings.clanId && room.winner) {
                const winnerPlayer = room.players.find(p => p.name === room.winner);
                const winnerName = winnerPlayer?.authUsername || room.winner;
                const allNames = room.players.map(p => p.authUsername || p.name);
                await recordGameResult(room.settings.clanId, winnerName, allNames);
              }
            }
          }
        }
        break;
      }

      case 'startVoting': {
        room.status = 'voting';
        room.players.forEach(p => {
          p.votedFor = null;
        });
        room.votes = {};
        break;
      }

      case 'submitVotesManually': {
        // Payload form: Record<voterName, votedForName>
        const manualVotes: Record<string, string> = payload;
        const activePlayers = room.players.filter(p => !p.isEliminated);

        activePlayers.forEach(p => {
          const vote = manualVotes[p.name];
          if (vote && vote !== p.name) {
            p.votedFor = vote;
          }
        });

        // Compute votes
        const voteCounts: Record<string, number> = {};
        activePlayers.forEach(p => {
          if (p.votedFor) {
            voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
          }
        });

        room.votes = voteCounts;

        let maxVotes = 0;
        activePlayers.forEach(p => {
          const v = voteCounts[p.name] || 0;
          if (v > maxVotes) maxVotes = v;
        });

        const tied = activePlayers.filter(p => (voteCounts[p.name] || 0) === maxVotes).map(p => p.name);

        if (tied.length > 1) {
          room.tiePlayers = tied;
          room.status = 'tiebreaker';
          room.tieBreakerResolved = false;
        } else if (tied.length === 1) {
          eliminatePlayer(room, tied[0]);
        }
        break;
      }

      case 'resolveTieBreaker': {
        const { eliminatedPlayerName } = payload;
        room.tieBreakerResolved = true;
        eliminatePlayer(room, eliminatedPlayerName);
        break;
      }

      case 'startFinaleTimer': {
        if (room.status === 'finale') {
          room.currentQuestionActiveAt = Date.now();
        }
        break;
      }

      case 'eliminatePlayerDirectly': {
        const { name } = payload;
        eliminatePlayer(room, name);
        break;
      }

      case 'resolveVoting': {
        const activePlayers = room.players.filter(p => !p.isEliminated);
        const voteCounts: Record<string, number> = {};
        activePlayers.forEach(p => {
          if (p.votedFor) {
            voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
          }
        });

        room.votes = voteCounts;

        let maxVotes = 0;
        activePlayers.forEach(p => {
          const v = voteCounts[p.name] || 0;
          if (v > maxVotes) maxVotes = v;
        });

        const tied = activePlayers.filter(p => (voteCounts[p.name] || 0) === maxVotes).map(p => p.name);

        if (tied.length > 1) {
          room.tiePlayers = tied;
          room.status = 'tiebreaker';
          room.tieBreakerResolved = false;
        } else if (tied.length === 1) {
          eliminatePlayer(room, tied[0]);
        }
        break;
      }

      case 'resetGame': {
        room.status = 'lobby';
        room.players.forEach(p => {
          p.lives = room.settings.lives;
          p.swimLifeUsed = false;
          p.isEliminated = false;
          p.score = 0;
          p.totalCorrect = 0;
          p.totalQuestions = 0;
          p.votedFor = null;
        });
        room.currentRound = 1;
        room.winner = null;
        break;
      }
    }

    res.json(room);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Action processing failed.' });
  }
});

// INITIALIZE PERSISTENCE BEFORE LAUNCHING SERVER
async function startApp() {
  await initDb();

  // Create the development Vite server middleware in dev mode
  const isProduction = process.env.NODE_ENV === 'production' || __dirname.includes('dist');
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Der Dümmste fliegt] Server running on http://0.0.0.0:${PORT}`);
  });
}

startApp().catch(err => {
  console.error('Failed to start application:', err);
});
