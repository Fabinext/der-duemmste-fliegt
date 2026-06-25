import React, { useState, useEffect, useRef } from 'react';
import { GameRoom } from '../types.ts';
import { Shield, Vote, Users, HelpCircle, Check, AlertCircle, Heart, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PlayerViewProps {
  onBackToHome: () => void;
}

export default function PlayerView({ onBackToHome }: PlayerViewProps) {
  const [currentUser] = useState<{ id: number; username: string; clanId: number | null } | null>(() => {
    const saved = localStorage.getItem('game_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [deviceId] = useState(() => Math.random().toString(36).substring(2) + Date.now().toString(36));
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const lastUpdatedRef = useRef<number>(0);

  // Sync countdown timer state
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Poll state once joined
  const pollRoomState = async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/room/${roomCode.toUpperCase()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.lastUpdated >= lastUpdatedRef.current) {
          lastUpdatedRef.current = data.lastUpdated;
          setRoom(data);
        }
        setError(null);
      } else {
        setError('Verbindung zum Raum verloren.');
      }
    } catch (err) {
      setError('Verbindungsfehler.');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (joined && roomCode) {
      pollRoomState();
      interval = setInterval(pollRoomState, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [joined, roomCode]);

  // Reset vote state when room status changes away from voting
  useEffect(() => {
    if (room && room.status !== 'voting') {
      setHasVoted(false);
      setSuccessMsg(null);
    }
  }, [room?.status]);

  // Handle the active companion timer for spectators / active players
  useEffect(() => {
    if (!room || room.status !== 'finale' || !room.currentQuestionActiveAt || !room.currentQuestion) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - room.currentQuestionActiveAt;
      const remaining = Math.max(0, 5000 - elapsed);
      const remainingSecs = Math.ceil(remaining / 1000);
      
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(remainingSecs);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [room?.currentQuestionActiveAt, room?.currentQuestion]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !playerName.trim()) return;

    setError(null);
    try {
      const res = await fetch(`/api/room/${roomCode.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: playerName.trim(), 
          deviceId,
          authUsername: currentUser ? currentUser.username : null
        })
      });

      if (res.ok) {
        setJoined(true);
        pollRoomState();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Beitritt fehlgeschlagen.');
      }
    } catch (err) {
      setError('Netzwerkfehler beim Beitreten.');
    }
  };

  const handleVoteSubmit = async (votedForName: string) => {
    if (hasVoted) return;
    setError(null);
    try {
      const res = await fetch(`/api/room/${roomCode.toUpperCase()}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterName: playerName, votedForName, deviceId })
      });

      if (res.ok) {
        setHasVoted(true);
        setSuccessMsg(`Deine Stimme für ${votedForName} wurde gezählt!`);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Abstimmung fehlgeschlagen.');
      }
    } catch (err) {
      setError('Verbindungsfehler bei der Abstimmung.');
    }
  };

  const handleLeave = () => {
    setJoined(false);
    setRoom(null);
    setRoomCode('');
    setPlayerName('');
    onBackToHome();
  };

  // NOT JOINED SCREEN: ROOM ACCESS FORM
  if (!joined) {
    return (
      <div className="max-w-md mx-auto bg-[#0b0c24]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl text-white space-y-6">
        <div className="text-center space-y-1.5">
          <Shield className="w-12 h-12 text-blue-400 mx-auto animate-pulse" />
          <h2 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
            Als Spieler beitreten
          </h2>
          <p className="text-slate-300 text-xs">
            Gib den 4-stelligen Code auf dem Hauptbildschirm und deinen Namen ein.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/15 border border-red-500/20 text-red-200 rounded-xl p-3.5 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Raum-Code</label>
            <input
              type="text"
              placeholder="z.B. ABCD"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={4}
              required
              className="w-full bg-[#05051a]/80 border border-white/10 focus:border-indigo-400/50 rounded-xl px-4 py-3.5 text-center text-lg font-mono font-bold uppercase tracking-widest text-indigo-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dein Name</label>
            <input
              type="text"
              placeholder="z.B. Max"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={16}
              required
              className="w-full bg-white/5 border border-white/10 focus:border-indigo-400/50 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-lg tracking-wider cursor-pointer"
          >
            DEM RAUM BEITRETEN
          </button>
        </form>

        <div className="text-center pt-2">
          <button 
            onClick={onBackToHome}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  // WAITING FOR ROOM POLLING
  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-400 mb-4"></div>
        <p className="text-slate-300 text-sm">Verbinde zum Spiel...</p>
      </div>
    );
  }

  const isLocalMode = room.settings.gameMode === 'local';

  // LOCAL MODE / SPECTATOR VIEW ONLY (NO ACTIVE PLAY TO VOTE ON MOBILE)
  if (isLocalMode) {
    return (
      <div className="max-w-md mx-auto text-white space-y-6 pb-12">
        {/* Companion Header */}
        <div className="bg-[#0b0c24]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl">
          <div>
            <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold font-mono block">Modus:</span>
            <span className="font-extrabold text-white text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Zuschauer-Bildschirm
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block font-mono">Raum-Code:</span>
              <span className="font-black font-mono text-indigo-300 text-md">{roomCode}</span>
            </div>
            <button 
              onClick={handleLeave}
              className="text-slate-500 hover:text-red-400 p-2 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
              title="Verlassen"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ACTIVE PLAYER & STATUS */}
        <div className="bg-[#05051a]/60 border border-white/10 rounded-2xl p-5 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          {room.status === 'round' || room.status === 'finale' ? (
            <div className="space-y-1">
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold block">Aktiver Spieler</span>
              <h2 className="text-2xl font-black text-white drop-shadow-sm">
                {room.activePlayerName || '---'}
              </h2>
            </div>
          ) : room.status === 'voting' ? (
            <div className="space-y-1">
              <span className="text-xs text-red-400 uppercase tracking-widest font-black block">Abstimmungs-Phase</span>
              <h2 className="text-sm font-bold text-slate-100">
                Abstimmung läuft! Zeigt mit dem Finger auf den Spieler, der fliegen soll!
              </h2>
            </div>
          ) : room.status === 'summary' ? (
            <div className="space-y-1">
              <span className="text-xs text-indigo-400 uppercase tracking-widest font-black block">Auswertung</span>
              <h2 className="text-sm font-bold text-slate-100">
                Auswertung am Hauptbildschirm! Wer fliegt heute raus?
              </h2>
            </div>
          ) : room.status === 'tiebreaker' ? (
            <div className="space-y-1">
              <span className="text-xs text-amber-400 uppercase tracking-widest font-black block">Stichfrage (Tie-Breaker)</span>
              <h2 className="text-sm font-bold text-slate-100">
                Gleichstand! Eine Stichfrage entscheidet!
              </h2>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase tracking-widest font-black block">Status</span>
              <h2 className="text-sm font-bold text-slate-100">Warten auf Spielleiter...</h2>
            </div>
          )}
        </div>

        {/* QUESTIONS COMPANION VIEW */}
        {(room.status === 'round' || room.status === 'finale' || room.status === 'tiebreaker') && (
          <div className="bg-[#0b0c24]/85 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
            
            {/* Real-time Synced Countdown Timer */}
            {timeLeft !== null && timeLeft > 0 && (
              <div className="flex flex-col items-center justify-center pt-2">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <div className={`absolute inset-0 rounded-full border-4 ${timeLeft <= 2 ? 'border-red-500 animate-ping opacity-25' : 'border-indigo-500/30'}`}></div>
                  <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center bg-indigo-950/60 border-2 ${timeLeft <= 2 ? 'border-red-500' : 'border-indigo-500'}`}>
                    <span className={`text-2xl font-black font-mono leading-none ${timeLeft <= 2 ? 'text-red-500' : 'text-white'}`}>
                      {timeLeft}
                    </span>
                    <span className="text-[8px] uppercase font-bold tracking-wider text-slate-400">Sek</span>
                  </div>
                </div>
              </div>
            )}

            {/* Question description */}
            <div className="text-center space-y-3">
              {room.currentQuestion ? (
                <>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full px-3 py-1 font-mono uppercase tracking-wider font-semibold inline-block">
                      Finale Frage
                    </span>
                    <span className={`text-[8px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                      room.currentQuestion.source === 'ai' || room.currentQuestion.id < 0
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {room.currentQuestion.source === 'ai' || room.currentQuestion.id < 0
                        ? '✨ Gemini KI'
                        : '📚 Fragen-Pool'}
                    </span>
                  </div>
                  <p className="text-md sm:text-lg font-bold leading-relaxed text-slate-100">
                    {room.currentQuestion.question}
                  </p>
                </>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center gap-3">
                  <div className="flex gap-1.5 items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Warten auf Frage...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROOM PLAYERS SCOREBOARD COMPANION */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
          <h3 className="text-xs font-extrabold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-white/5 pb-2">
            <Users className="w-4 h-4 text-blue-400" />
            Aktueller Spielstand
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {room.players.map((p: any) => (
              <div 
                key={p.name} 
                className={`flex items-center justify-between bg-[#05051a]/40 border rounded-xl p-3 ${
                  p.isEliminated 
                    ? 'border-red-500/15 opacity-55 bg-red-950/5' 
                    : p.name === room.activePlayerName 
                      ? 'border-indigo-500/40 bg-indigo-500/5' 
                      : 'border-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${p.isEliminated ? 'text-slate-500 line-through font-normal' : 'text-slate-100'}`}>
                    {p.name}
                  </span>
                  {p.name === room.activePlayerName && (
                    <span className="text-[8px] bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 font-extrabold uppercase tracking-wider rounded px-1.5 py-0.5">Aktiv</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono">Punkte: {p.score || 0}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: room.settings.lives }).map((_, i) => (
                      <Heart 
                        key={i} 
                        className={`w-3.5 h-3.5 ${i < p.lives ? 'text-red-500 fill-red-500' : 'text-slate-800'}`} 
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ONLINE LOBBY / MULTIPLAYER GAME FLOW
  const myPlayerState = room.players.find((p: any) => p.name.toLowerCase() === playerName.toLowerCase());

  return (
    <div className="max-w-md mx-auto text-white space-y-6 pb-12">
      
      {/* REMOTE HEADER */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-xl">
        <div className="min-w-0">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Spieler:</span>
          <span className="font-bold text-indigo-300 truncate block text-md">{playerName}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block font-mono">Raum:</span>
            <span className="font-bold font-mono text-white text-md">{roomCode}</span>
          </div>
          <button 
            onClick={handleLeave}
            className="text-slate-500 hover:text-red-400 p-2 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
            title="Raum verlassen"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl p-3.5 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* PLAYER CURRENT STATUS CARD */}
      {myPlayerState && (
        <div className="bg-[#0c0c24]/50 border border-white/10 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Deine Leben:</span>
            <div className="flex gap-1 mt-1">
              {Array.from({ length: room.settings.lives }).map((_, i) => (
                <Heart 
                  key={i} 
                  className={`w-4 h-4 ${i < myPlayerState.lives ? 'text-red-500 fill-red-500' : 'text-slate-800'}`} 
                />
              ))}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block font-mono">Status:</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
              myPlayerState.isEliminated 
                ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {myPlayerState.isEliminated ? 'Raus' : 'Im Spiel'}
            </span>
          </div>
        </div>
      )}

      {/* REACTIVE BODY CONTAINER */}
      <AnimatePresence mode="wait">
        
        {/* 1. LOBBY */}
        {room.status === 'lobby' && (
          <motion.div
            key="lobby-wait"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center space-y-4"
          >
            <Users className="w-10 h-10 text-blue-400 mx-auto animate-pulse" />
            <div>
              <h3 className="font-bold text-lg">Warten in der Lobby</h3>
              <p className="text-xs text-slate-300 mt-1">Der Spielleiter stellt das Spiel ein. Schau auf den Hauptbildschirm, um alle Spieler zu sehen.</p>
            </div>
            <div className="bg-[#0c0c24]/50 rounded-xl p-3 border border-white/10 text-xs text-slate-400 font-mono">
              Mitspieler im Raum: {room.players.length}
            </div>
          </motion.div>
        )}

        {/* 2. ROUND / SUMMARY / TIEBREAKER / FINALE ACTIVE STATES */}
        {(room.status === 'round' || room.status === 'summary' || room.status === 'tiebreaker' || room.status === 'finale') && (
          <motion.div
            key="game-active-remote"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* ACTIVE PLAYER & STATUS */}
            <div className="bg-[#05051a]/60 border border-white/10 rounded-2xl p-5 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500"></div>
              {room.status === 'round' || room.status === 'finale' ? (
                <div className="space-y-1">
                  <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold block">Aktiver Spieler</span>
                  <h2 className="text-2xl font-black text-white drop-shadow-sm">
                    {room.activePlayerName || '---'}
                  </h2>
                  {room.activePlayerName && room.activePlayerName.toLowerCase() === playerName.toLowerCase() && (
                    <span className="text-xs text-emerald-400 font-bold animate-pulse block mt-1">★ DU BIST DRAN! ★</span>
                  )}
                </div>
              ) : room.status === 'summary' ? (
                <div className="space-y-1">
                  <span className="text-xs text-indigo-400 uppercase tracking-widest font-black block">Auswertung</span>
                  <h2 className="text-sm font-bold text-slate-100">
                    Auswertung am Hauptbildschirm! Wer fliegt heute raus?
                  </h2>
                </div>
              ) : room.status === 'tiebreaker' ? (
                <div className="space-y-1">
                  <span className="text-xs text-amber-400 uppercase tracking-widest font-black block">Stichfrage (Tie-Breaker)</span>
                  <h2 className="text-sm font-bold text-slate-100">
                    Gleichstand! Eine Stichfrage entscheidet!
                  </h2>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 uppercase tracking-widest font-black block">Status</span>
                  <h2 className="text-sm font-bold text-slate-100">Warten auf Spielleiter...</h2>
                </div>
              )}
            </div>

            {/* QUESTIONS COMPANION VIEW */}
            {(room.status === 'round' || room.status === 'finale' || room.status === 'tiebreaker') && (
              <div className="bg-[#0b0c24]/85 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
                
                {/* Real-time Synced Countdown Timer */}
                {timeLeft !== null && timeLeft > 0 && (
                  <div className="flex flex-col items-center justify-center pt-2">
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <div className={`absolute inset-0 rounded-full border-4 ${timeLeft <= 2 ? 'border-red-500 animate-ping opacity-25' : 'border-indigo-500/30'}`}></div>
                      <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center bg-indigo-950/60 border-2 ${timeLeft <= 2 ? 'border-red-500' : 'border-indigo-500'}`}>
                        <span className={`text-2xl font-black font-mono leading-none ${timeLeft <= 2 ? 'text-red-500' : 'text-white'}`}>
                          {timeLeft}
                        </span>
                        <span className="text-[8px] uppercase font-bold tracking-wider text-slate-400">Sek</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Question description */}
                <div className="text-center space-y-3">
                  {room.currentQuestion ? (
                    <>
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full px-3 py-1 font-mono uppercase tracking-wider font-semibold inline-block">
                          {room.currentQuestion.category || 'Allgemeinwissen'}
                        </span>
                        <span className={`text-[8px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          room.currentQuestion.source === 'ai' || room.currentQuestion.id < 0
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {room.currentQuestion.source === 'ai' || room.currentQuestion.id < 0
                            ? '✨ Gemini KI'
                            : '📚 Fragen-Pool'}
                        </span>
                      </div>
                      <p className="text-md sm:text-lg font-bold leading-relaxed text-slate-100">
                        {room.currentQuestion.question}
                      </p>
                    </>
                  ) : (
                    <div className="py-6 flex flex-col items-center justify-center gap-3">
                      <div className="flex gap-1.5 items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium">Warten auf Frage...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ROOM PLAYERS SCOREBOARD COMPANION */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="text-xs font-extrabold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-white/5 pb-2">
                <Users className="w-4 h-4 text-blue-400" />
                Aktueller Spielstand
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {room.players.map((p: any) => (
                  <div 
                    key={p.name} 
                    className={`flex items-center justify-between bg-[#05051a]/40 border rounded-xl p-3 ${
                      p.isEliminated 
                        ? 'border-red-500/15 opacity-55 bg-red-950/5' 
                        : p.name === room.activePlayerName 
                          ? 'border-indigo-500/40 bg-indigo-500/5' 
                          : 'border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${p.isEliminated ? 'text-slate-500 line-through font-normal' : 'text-slate-100'}`}>
                        {p.name}
                      </span>
                      {p.name === room.activePlayerName && (
                        <span className="text-[8px] bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 font-extrabold uppercase tracking-wider rounded px-1.5 py-0.5">Aktiv</span>
                      )}
                      {p.name.toLowerCase() === playerName.toLowerCase() && (
                        <span className="text-[8px] bg-white/10 border border-white/10 text-white font-extrabold uppercase tracking-wider rounded px-1.5 py-0.5 font-mono">Du</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono">Punkte: {p.score || 0}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: room.settings.lives }).map((_, i) => (
                          <Heart 
                            key={i} 
                            className={`w-3.5 h-3.5 ${i < p.lives ? 'text-red-500 fill-red-500' : 'text-slate-800'}`} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* 3. ACTIVE VOTING PHASE */}
        {room.status === 'voting' && (
          <motion.div
            key="voting-remote"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-4 shadow-xl"
          >
            <div className="text-center space-y-1">
              <Vote className="w-8 h-8 text-blue-400 mx-auto animate-pulse" />
              <h3 className="font-bold text-lg">Wer ist der Schwächste?</h3>
              <p className="text-xs text-slate-300">Wähle den Spieler, der deiner Meinung nach ausscheiden sollte.</p>
            </div>

            {myPlayerState?.isEliminated ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-4 text-xs text-center">
                Da du ausgeschieden bist, darfst du in dieser Phase nicht mitbestimmen.
              </div>
            ) : hasVoted ? (
              <div className="bg-[#0c0c24]/50 border border-white/10 text-emerald-300 rounded-xl p-4 text-xs text-center space-y-2">
                <Check className="w-6 h-6 text-emerald-400 mx-auto" />
                <p>{successMsg}</p>
                <p className="text-[10px] text-slate-400">Warte auf die anderen Spieler...</p>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                {room.players
                  .filter((p: any) => !p.isEliminated && p.name !== playerName)
                  .map((p: any) => (
                    <button
                      key={p.name}
                      onClick={() => handleVoteSubmit(p.name)}
                      className="w-full text-left bg-[#0c0c24]/80 hover:bg-indigo-600/10 border border-white/10 hover:border-indigo-400/50 text-white font-medium px-4 py-3.5 rounded-xl text-sm transition-all flex items-center justify-between cursor-pointer"
                      style={{ minHeight: '44px' }}
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">Stimme abgeben</span>
                    </button>
                  ))}
              </div>
            )}
          </motion.div>
        )}

        {/* 4. GAME OVER */}
        {room.status === 'ended' && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center space-y-4"
          >
            <h3 className="text-lg font-bold text-yellow-400">Spiel Beendet</h3>
            <p className="text-sm text-slate-300">Der Sieger am Hauptbildschirm ist:</p>
            <p className="text-xl font-extrabold text-white bg-[#0c0c24]/80 py-3 rounded-xl border border-white/10">
              {room.winner}
            </p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
