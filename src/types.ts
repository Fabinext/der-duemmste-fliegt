export interface TriviaQuestion {
  id: number;
  category: string;
  question: string;
  answer: string;
  source?: 'preset' | 'ai';
}

export interface RoundQuestionHistory {
  question: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface GamePlayer {
  name: string;
  lives: number;
  swimLifeUsed: boolean;
  isEliminated: boolean;
  score: number;
  totalCorrect: number;
  totalQuestions: number;
  votedFor: string | null;
  deviceId: string | null;
  roundQuestionsAsked?: number;
  roundHistory?: RoundQuestionHistory[];
  authUsername?: string | null;
}

export interface GameRoom {
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
  finaleScores: Record<string, number[]>;
  finaleActivePlayer: string | null;
  finaleQuestionIndex: number;
  winner: string | null;
}

export interface Clan {
  id: number;
  name: string;
}

export interface ClanPlayer {
  id: number;
  name: string;
  clan_id: number;
  rounds_played: number;
  wins: number;
}
