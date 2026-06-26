import React, { useState, useEffect, useRef } from 'react';
import { GameRoom, GamePlayer, TriviaQuestion } from '../types.ts';
import { 
  Heart, Play, Check, X, RotateCcw, AlertTriangle, 
  HelpCircle, Sparkles, Timer, Award, Vote, Users, Eye, EyeOff,
  ChevronDown, ChevronUp, CheckCircle, XCircle, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GMViewProps {
  roomCode: string;
  gmToken: string;
  onExit: () => void;
}

export default function GMView({ roomCode, gmToken, onExit }: GMViewProps) {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Zufall');
  const [manualVotes, setManualVotes] = useState<Record<string, string>>({});
  const [timerSeconds, setTimerSeconds] = useState(5);
  const [showWrongAnswerInput, setShowWrongAnswerInput] = useState(false);
  const [wrongAnswerText, setWrongAnswerText] = useState('');
  const [isTimeoutState, setIsTimeoutState] = useState(false);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdatedRef = useRef<number>(0);

  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [selectedEvalPlayer, setSelectedEvalPlayer] = useState<string | null>(null);
  const [apiTestError, setApiTestError] = useState<string | null>(null);

  const handleTestApiKey = async () => {
    if (!room) return;
    setApiTestStatus('testing');
    setApiTestError(null);
    try {
      const res = await fetch('/api/test-gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: room.settings.geminiApiKey })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApiTestStatus('success');
      } else {
        setApiTestStatus('error');
        setApiTestError(data.error || 'Test fehlgeschlagen.');
      }
    } catch (err: any) {
      setApiTestStatus('error');
      setApiTestError('Netzwerkfehler beim Testen.');
    }
  };

  const categories = ['Zufall', 'Allgemeinwissen', 'Popkultur', 'Geografie', 'Gaming', 'Trivia'];

  // Polling function for real-time state synchronization
  const fetchRoomState = async () => {
    try {
      const res = await fetch(`/api/room/${roomCode}/gm?token=${gmToken}`);
      if (res.ok) {
        const data = await res.json();
        if (data.lastUpdated >= lastUpdatedRef.current) {
          lastUpdatedRef.current = data.lastUpdated;
          setRoom(data);
        }
        setError(null);
      } else {
        setError('Raum-Informationen konnten nicht geladen werden.');
      }
    } catch (err) {
      setError('Verbindung zum Server unterbrochen.');
    }
  };

  // Poll state every 1.5 seconds to track real-time joins and votes
  useEffect(() => {
    fetchRoomState();
    const interval = setInterval(fetchRoomState, 1500);
    return () => clearInterval(interval);
  }, [roomCode, gmToken]);

  // Handle 5-second countdown timer in Finale Mode
  useEffect(() => {
    if (room?.status === 'finale' && room.currentQuestion && room.currentQuestionActiveAt) {
      setIsAnswerRevealed(false);
      setTimerSeconds(5);
      
      let currentSeconds = 5;

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(() => {
        currentSeconds -= 1;
        if (currentSeconds <= 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setTimerSeconds(0);
          setIsTimeoutState(true);
          setShowWrongAnswerInput(true);
        } else {
          setTimerSeconds(currentSeconds);
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimerSeconds(5);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [room?.status, room?.currentQuestion?.id, room?.currentQuestion?.question, room?.currentQuestionActiveAt, room?.finaleQuestionIndex, room?.finaleActivePlayer]);

  const handleGMAction = async (action: string, payload: any = {}) => {
    try {
      const res = await fetch(`/api/room/${roomCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, token: gmToken })
      });
      if (res.ok) {
        const updatedRoom = await res.json();
        if (updatedRoom.lastUpdated >= lastUpdatedRef.current) {
          lastUpdatedRef.current = updatedRoom.lastUpdated;
          setRoom(updatedRoom);
        }
        setIsAnswerRevealed(false);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Aktion fehlgeschlagen.');
      }
    } catch (err) {
      setError('Netzwerkfehler bei Geste.');
    }
  };

  const handleAddLocalPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem('playerName') as HTMLInputElement;
    if (input && input.value.trim()) {
      handleGMAction('addLocalPlayer', { name: input.value.trim() });
      input.value = '';
    }
  };

  const handleManualVoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGMAction('submitVotesManually', manualVotes);
    setManualVotes({});
  };

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-400 mb-4"></div>
        <p className="text-slate-300">Lade Spielleiter-Bildschirm...</p>
      </div>
    );
  }

  const activePlayers = room.players.filter(p => !p.isEliminated);
  const currentPlayer = room.status === 'round' ? room.players[room.activePlayerIndex] : null;

  return (
    <div className="space-y-6 text-white pb-12">
      {/* ERROR HEADER */}
      {error && (
        <div className="bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-200 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* GAME MASTER HEADER BAR */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div>
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Spielleiter-Konsole</span>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
            Raum-Code: <span className="font-mono text-white selection:bg-indigo-500/30">{room.roomCode}</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#0c0c24] px-4 py-2 rounded-xl border border-white/10 text-xs flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{room.players.length} Spieler</span>
            <span className="text-slate-500">|</span>
            <span className="text-indigo-300 font-semibold capitalize">{room.settings.gameMode}-Modus</span>
          </div>
          <button 
            onClick={onExit}
            className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold py-2.5 px-4 rounded-xl transition-all cursor-pointer"
          >
            Spiel beenden &amp; Verlassen
          </button>
        </div>
      </div>

      {/* STAGE CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: ACTIVE VIEW BASED ON STATUS */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Mobile Compact Player List (visible only on mobile/tablet) */}
          {room.status !== 'lobby' && room.players.length > 0 && (
            <div className="block lg:hidden bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10 overflow-x-auto whitespace-nowrap scrollbar-none">
              <div className="inline-flex gap-2">
                {room.players.map((p, index) => {
                  const isCurrent = room.status === 'round' && room.activePlayerIndex === index;
                  return (
                    <div
                      key={p.name}
                      className={`inline-flex items-center gap-2 rounded-lg py-1.5 px-3 border text-xs ${
                        p.isEliminated
                          ? 'bg-red-950/10 border-red-950/20 text-slate-500 opacity-60'
                          : isCurrent
                          ? 'bg-indigo-600/25 border-indigo-400 text-white font-bold'
                          : 'bg-[#0c0c24]/50 border-white/5 text-slate-300'
                      }`}
                    >
                      <span className="truncate max-w-[120px]">
                        {p.name}
                        {room.status === 'round' && !p.isEliminated && ` (${p.roundQuestionsAsked || 0}/${room.settings.cycleCount})`}
                      </span>
                      {!p.isEliminated && (
                        <div className="flex gap-0.5">
                          {Array.from({ length: room.settings.lives }).map((_, i) => (
                            <Heart
                              key={i}
                              className={`w-3 h-3 ${i < p.lives ? 'text-red-500 fill-red-500' : 'text-slate-800'}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* 1. LOBBY STATE */}
            {room.status === 'lobby' && (
              <motion.div
                key="lobby"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-indigo-600/20 rounded-full text-blue-400 mb-2 border border-indigo-400/30">
                    <Users className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-bold">Warten auf Spieler</h3>
                  <p className="text-slate-300 text-sm max-w-md mx-auto">
                    {room.settings.gameMode === 'lobby' 
                      ? 'Spieler können auf ihren Mobilgeräten über den Code beitreten, um digital abzustimmen.'
                      : 'Trage unten die Namen der Mitspieler ein, um lokal direkt auf diesem Bildschirm zu spielen.'}
                  </p>
                </div>

                {/* Local player entry */}
                {room.settings.gameMode === 'local' && (
                  <form onSubmit={handleAddLocalPlayer} className="flex gap-2 max-w-md mx-auto">
                    <input
                      type="text"
                      name="playerName"
                      placeholder="Name des Spielers..."
                      maxLength={16}
                      className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-400/50 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none transition-colors"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-all cursor-pointer"
                    >
                      Hinzufügen
                    </button>
                  </form>
                )}

                {/* Direct Players list in the Lobby Console view (ideal for mobile) */}
                {room.players.length > 0 && (
                  <div className="bg-[#0c0c24]/30 rounded-xl p-4 border border-white/5 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Beigetretene Spieler ({room.players.length}):</span>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {room.players.map(p => (
                        <div key={p.name} className="bg-indigo-900/25 border border-indigo-500/20 rounded-xl px-3 py-1.5 text-xs flex items-center gap-2">
                          <span className="font-bold text-slate-100">{p.name}</span>
                          <button
                            onClick={() => handleGMAction('removePlayer', { name: p.name })}
                            className="text-red-400 hover:text-red-300 transition-colors text-sm font-extrabold focus:outline-none cursor-pointer"
                            title="Entfernen"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings Panel in Lobby */}
                <div className="bg-[#0c0c24]/50 rounded-xl p-5 border border-white/10 space-y-4">
                  <h4 className="text-sm font-semibold text-indigo-300">Spielregeln anpassen</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Start-Leben</label>
                      <select
                        value={room.settings.lives}
                        onChange={(e) => handleGMAction('updateSettings', { ...room.settings, lives: e.target.value })}
                        className="w-full bg-[#0c0c24] border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none"
                      >
                        <option value="1" className="bg-[#0c0c24]">1 Leben</option>
                        <option value="2" className="bg-[#0c0c24]">2 Leben</option>
                        <option value="3" className="bg-[#0c0c24]">3 Leben (Standard)</option>
                        <option value="4" className="bg-[#0c0c24]">4 Leben</option>
                        <option value="5" className="bg-[#0c0c24]">5 Leben</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Fragen pro Spieler / Runde</label>
                      <select
                        value={room.settings.cycleCount}
                        onChange={(e) => handleGMAction('updateSettings', { ...room.settings, cycleCount: e.target.value })}
                        className="w-full bg-[#0c0c24] border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none"
                      >
                        <option value="1" className="bg-[#0c0c24]">1 Frage</option>
                        <option value="2" className="bg-[#0c0c24]">2 Fragen (Standard)</option>
                        <option value="3" className="bg-[#0c0c24]">3 Fragen</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Spielmodus (Ausgewählt)</label>
                      <div className="bg-[#0c0c24]/50 border border-white/5 rounded-lg p-2.5 text-xs text-indigo-300 font-bold">
                        {room.settings.gameMode === 'local' ? 'Lokal (1 Bildschirm)' : 'Online (Handy-Beteiligung)'}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Swim Life */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div>
                      <span className="text-xs font-medium text-slate-200">Schwimmer-Leben (Bonusleben)</span>
                      <p className="text-[10px] text-slate-400">Der erste Spieler auf 0 Leben scheidet nicht sofort aus, sondern schwimmt mit 1 Bonusleben weiter.</p>
                    </div>
                    <button
                      onClick={() => handleGMAction('updateSettings', { ...room.settings, swimLife: !room.settings.swimLife })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                        room.settings.swimLife 
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >
                      {room.settings.swimLife ? 'Aktiviert' : 'Deaktiviert'}
                    </button>
                  </div>

                  {/* Toggle KI-Fragen */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div>
                      <span className="text-xs font-medium text-slate-200">Künstliche Intelligenz (Gemini KI-Fragen)</span>
                      <p className="text-[10px] text-slate-400">Generiere dynamische Fragen live über Gemini (Deaktivieren für instantane, fehlerfreie Offline-Fragen).</p>
                    </div>
                    <button
                      onClick={() => handleGMAction('updateSettings', { ...room.settings, useAiQuestions: !room.settings.useAiQuestions })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                        room.settings.useAiQuestions 
                          ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/30' 
                          : 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {room.settings.useAiQuestions ? 'Aktiviert (Gemini)' : 'Deaktiviert (Klassisch)'}
                    </button>
                  </div>

                  {/* Toggle Finale Advantage */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div>
                      <span className="text-xs font-medium text-slate-200">Finale Einstiegs-Vorteil</span>
                      <p className="text-[10px] text-slate-400">Spieler mit mehr verbleibenden Leben erhalten zu Beginn des Finales entsprechende Vorsprungspunkte.</p>
                    </div>
                    <button
                      onClick={() => handleGMAction('updateSettings', { ...room.settings, finaleAdvantage: room.settings.finaleAdvantage === false ? true : false })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                        room.settings.finaleAdvantage !== false 
                          ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/30' 
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >
                      {room.settings.finaleAdvantage !== false ? 'Aktiviert' : 'Deaktiviert'}
                    </button>
                  </div>

                  {/* API KEY Input for optional AI category */}
                  <div className="pt-3 border-t border-white/10 space-y-1">
                    <label className="block text-xs font-medium text-slate-200">Optionaler Google Gemini API-Key</label>
                    <p className="text-[10px] text-slate-400">Ermöglicht grenzenlose KI-generierte Fragen für das Spiel.</p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="AI Studio API Key eintragen..."
                        value={room.settings.geminiApiKey || ''}
                        onChange={(e) => handleGMAction('updateSettings', { ...room.settings, geminiApiKey: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-indigo-400/40 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleTestApiKey}
                        disabled={apiTestStatus === 'testing'}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                          apiTestStatus === 'testing'
                            ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed'
                            : apiTestStatus === 'success'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : apiTestStatus === 'error'
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                        }`}
                      >
                        {apiTestStatus === 'testing' ? 'Prüfe...' : apiTestStatus === 'success' ? 'Erfolgreich ✓' : apiTestStatus === 'error' ? 'Fehler ✗' : 'TEST'}
                      </button>
                    </div>
                    {apiTestError && (
                      <p className="text-[10px] text-red-400 mt-1">{apiTestError}</p>
                    )}
                    {apiTestStatus === 'success' && (
                      <p className="text-[10px] text-emerald-400 mt-1">Verbindung erfolgreich! Gemini generiert jetzt Fragen.</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex justify-center">
                  <button
                    onClick={() => handleGMAction('startGame')}
                    disabled={room.players.length < 2}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-4 px-12 rounded-xl text-md tracking-wider flex items-center gap-2 shadow-xl transition-all cursor-pointer"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    SPIEL STARTEN
                  </button>
                </div>
              </motion.div>
            )}

            {/* 2. ROUND CIRCLE: THE ACTIVE QUESTIONS */}
            {room.status === 'round' && (
              <motion.div
                key="round"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                {/* Active Player Card */}
                {currentPlayer && (
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 bg-indigo-600/20 text-indigo-300 text-xs font-mono rounded-bl-xl border-l border-b border-white/10">
                      Frage {room.currentPlayerQuestionCount + 1} von {room.settings.cycleCount}
                    </div>

                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Aktiver Spieler am Zug</span>
                    <h3 className="text-3xl font-bold mt-1 text-white flex items-center gap-2">
                      <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">{currentPlayer.name}</span>
                    </h3>

                    {/* Hearts Display */}
                    <div className="flex items-center gap-1.5 mt-3">
                      {Array.from({ length: room.settings.lives }).map((_, i) => (
                        <Heart 
                          key={i} 
                          className={`w-5 h-5 ${i < currentPlayer.lives ? 'text-red-500 fill-red-500 animate-pulse' : 'text-slate-800'}`} 
                        />
                      ))}
                      {currentPlayer.swimLifeUsed && (
                        <span className="bg-blue-500/20 text-blue-300 text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider border border-blue-500/30">
                          Schwimmer 🏊
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Question Area */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 space-y-6 shadow-xl">
                  {!room.currentQuestion ? (
                    <div className="text-center py-12 space-y-6">
                      <HelpCircle className="w-16 h-16 text-indigo-400/40 mx-auto animate-pulse" />
                      <div className="space-y-1.5">
                        <p className="text-slate-200 font-bold text-lg">Bereit für die nächste Frage?</p>
                        <p className="text-xs text-slate-400">Die Frage wird vollkommen zufällig für {currentPlayer?.name} bestimmt.</p>
                      </div>

                      <button
                        onClick={() => handleGMAction('getQuestion', { category: 'Zufall' })}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-12 rounded-xl text-sm tracking-widest shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer inline-flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4 text-yellow-300 animate-spin-slow" />
                        FRAGE ANZEIGEN
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full border border-white/10 font-medium">
                          {room.currentQuestion.category}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${
                          room.currentQuestion.source === 'ai' || room.currentQuestion.id < 0
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {room.currentQuestion.source === 'ai' || room.currentQuestion.id < 0
                            ? '✨ Gemini KI (API)'
                            : '📚 Fragen-Pool (Lokal)'}
                        </span>
                      </div>

                      <div className="space-y-4">
                        <p className="text-slate-400 text-xs font-mono">FRAGE:</p>
                        <h4 className="text-2xl sm:text-3xl font-medium leading-relaxed text-slate-100">
                          {room.currentQuestion.question}
                        </h4>
                      </div>

                      {/* Answer Reveal Panel for GM */}
                      <div className="bg-[#0c0c24]/80 rounded-xl p-5 border border-white/10 space-y-1">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block mb-1">Richtige Antwort (bereits sichtbar für Spielleiter):</span>
                        <p className="text-xl font-bold text-emerald-400">{room.currentQuestion.answer}</p>
                      </div>

                      {/* Reroll Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleGMAction('rerollQuestion', { category: selectedCategory })}
                          className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer uppercase tracking-wider"
                          title="Frage neu auswürfeln"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Frage neu auswürfeln
                        </button>
                      </div>

                      {/* Answer decision buttons */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                        <button
                          onClick={() => handleGMAction('submitAnswer', { isCorrect: false })}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/50 font-semibold py-4 rounded-xl text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                          FALSCH
                        </button>
                        <button
                          onClick={() => handleGMAction('submitAnswer', { isCorrect: true })}
                          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/50 font-semibold py-4 rounded-xl text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Check className="w-5 h-5" />
                          RICHTIG
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 3. ROUND SUMMARY STATE */}
            {room.status === 'summary' && (
              <motion.div
                key="summary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-indigo-600/20 rounded-full text-blue-400 mb-1 border border-indigo-400/30">
                    <Award className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold">Runden-Übersicht</h3>
                  <p className="text-slate-300 text-sm">Wer hat in dieser Fragerunde geglänzt, und wer ist der Schwächste?</p>
                </div>

                <div className="bg-[#0c0c24]/50 rounded-xl border border-white/10 overflow-hidden">
                  <div className="grid grid-cols-12 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
                    <span className="col-span-6">Spieler</span>
                    <span className="col-span-3 text-center">Ergebnis</span>
                    <span className="col-span-3 text-center">Richtig-Quote</span>
                  </div>
                  <div className="divide-y divide-white/10">
                    {room.players.filter(p => !p.isEliminated).map((p) => {
                      const quote = room.settings.cycleCount > 0 ? Math.round((p.score / room.settings.cycleCount) * 100) : 0;
                      const hasHistory = p.roundHistory && p.roundHistory.length > 0;
                      return (
                        <div key={p.name} className="divide-y divide-white/5">
                          <div 
                            onClick={() => {
                              if (hasHistory) {
                                setExpandedPlayer(expandedPlayer === p.name ? null : p.name);
                              }
                            }}
                            className={`grid grid-cols-12 px-4 py-3.5 text-sm items-center transition-all select-none ${
                              hasHistory 
                                ? 'hover:bg-white/5 cursor-pointer' 
                                : 'opacity-85'
                            }`}
                          >
                            <span className="col-span-6 font-semibold text-slate-100 flex items-center gap-2">
                              {hasHistory && (
                                <span className="text-slate-400 shrink-0">
                                  {expandedPlayer === p.name ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </span>
                              )}
                              {p.name}
                            </span>
                            <span className="col-span-3 text-center text-slate-300 font-mono">
                              {p.score} / {room.settings.cycleCount}
                            </span>
                            <span className="col-span-3 text-center text-indigo-300 font-mono font-semibold">{quote}%</span>
                          </div>

                          <AnimatePresence initial={false}>
                            {expandedPlayer === p.name && hasHistory && p.roundHistory && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="overflow-hidden bg-[#08081f]/40 border-t border-white/5"
                              >
                                <div className="px-5 py-4 space-y-3">
                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Beantwortete Fragen in dieser Runde:</span>
                                  <div className="space-y-2.5">
                                    {p.roundHistory.map((h, hIdx) => (
                                      <div key={hIdx} className="bg-[#0c0c24]/85 rounded-xl p-3 border border-white/5 flex items-start gap-3">
                                        <div className="shrink-0 pt-0.5">
                                          {h.isCorrect ? (
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                          ) : (
                                            <XCircle className="w-4 h-4 text-red-400" />
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-slate-200 leading-relaxed">{h.question}</p>
                                          <p className="text-[11px] text-slate-400">
                                            Richtige Antwort: <span className="text-emerald-300 font-mono font-medium">{h.correctAnswer}</span>
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 flex justify-center">
                  <button
                    onClick={() => handleGMAction('startVoting')}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-10 rounded-xl text-sm tracking-wider shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Vote className="w-4 h-4" />
                    ZUR ABSTIMMUNG GEHEN
                  </button>
                </div>
              </motion.div>
            )}

            {/* 4. VOTING STATE */}
            {room.status === 'voting' && (
              <motion.div
                key="voting"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-indigo-600/20 rounded-full text-blue-400 mb-1 border border-indigo-400/30">
                    <Vote className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-bold">Wer fliegt heute?</h3>
                  <p className="text-slate-300 text-sm">
                    {room.settings.gameMode === 'lobby'
                      ? 'Spieler stimmen jetzt auf ihren Handys ab. Stimmen werden live synchronisiert.'
                      : 'Die Spieler stimmen ab, indem sie im Raum gleichzeitig auf den "Schwächsten" zeigen.'}
                  </p>
                </div>

                {/* Local Manual Vote Entry & Direct Elimination */}
                {room.settings.gameMode === 'local' ? (
                  <div className="space-y-6">
                    {/* Direct Elimination Option - Perfect for offline play */}
                    <div className="bg-[#0c0c24]/50 rounded-xl border border-white/10 p-6 space-y-4">
                      <div className="text-center space-y-1">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">Schnell-Eliminierung (Physisches Abstimmen)</span>
                        <p className="text-xs text-slate-400">Klicke auf den Spieler, der im Raum die meisten Stimmen/Finger bekommen hat:</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {room.players.filter(p => !p.isEliminated).map((p) => (
                          <div 
                            key={p.name} 
                            className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 flex items-center justify-between gap-4"
                          >
                            <div className="space-y-1 min-w-0">
                              <span className="font-bold text-slate-100 block truncate text-sm">{p.name}</span>
                              <div className="flex gap-0.5">
                                {Array.from({ length: room.settings.lives }).map((_, i) => (
                                  <Heart 
                                    key={i} 
                                    className={`w-3.5 h-3.5 shrink-0 ${i < p.lives ? 'text-red-500 fill-red-500' : 'text-slate-600'}`} 
                                  />
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => handleGMAction('eliminatePlayerDirectly', { name: p.name })}
                              className="bg-red-500/20 hover:bg-red-500/40 text-red-300 hover:text-red-200 border border-red-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                            >
                              Eliminieren
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Detailed dropdown vote form (hidden accordion) */}
                    <div className="border border-white/5 rounded-xl overflow-hidden bg-white/5">
                      <details className="group">
                        <summary className="flex items-center justify-between p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-white/5 select-none">
                          <span>Detaillierte Stimmen einzeln eintragen (optional)</span>
                          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="p-4 border-t border-white/5 bg-[#0c0c24]/30 space-y-4">
                          <form onSubmit={handleManualVoteSubmit} className="space-y-4">
                            <div className="space-y-3">
                              {room.players.filter(p => !p.isEliminated).map((voter) => (
                                <div key={voter.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-white/10 last:border-0">
                                  <span className="text-xs font-semibold text-slate-300">{voter.name} stimmt für:</span>
                                  <select
                                    value={manualVotes[voter.name] || ''}
                                    onChange={(e) => setManualVotes(prev => ({ ...prev, [voter.name]: e.target.value }))}
                                    required
                                    className="bg-[#0c0c24] border border-white/10 rounded-lg text-xs p-2 text-white outline-none min-w-[160px]"
                                  >
                                    <option value="" className="bg-[#0c0c24]">-- Wählen --</option>
                                    {room.players
                                      .filter(candidate => !candidate.isEliminated && candidate.name !== voter.name)
                                      .map(candidate => (
                                        <option key={candidate.name} value={candidate.name} className="bg-[#0c0c24]">
                                          {candidate.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-center pt-2">
                              <button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-all cursor-pointer"
                              >
                                STIMMEN EINREICHEN & AUSWERTEN
                              </button>
                            </div>
                          </form>
                        </div>
                      </details>
                    </div>
                  </div>
                ) : (
                  // Mobile / Online mode
                  <div className="space-y-6">
                    {(() => {
                      const activePlayers = room.players.filter(p => !p.isEliminated);
                      const allVoted = activePlayers.length > 0 && activePlayers.every(p => p.votedFor !== null);

                      if (allVoted) {
                        // Let's render the vote tallies!
                        const voteCounts: Record<string, number> = {};
                        activePlayers.forEach(p => {
                          if (p.votedFor) {
                            voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
                          }
                        });

                        return (
                          <div className="space-y-6">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 animate-bounce" />
                              <h4 className="text-md font-bold text-emerald-300">Alle Spieler haben abgestimmt!</h4>
                              <p className="text-xs text-slate-300">Hier sind die Stimmergebnisse:</p>
                            </div>

                            <div className="space-y-3">
                              {activePlayers.map((p) => {
                                const votesCount = voteCounts[p.name] || 0;
                                const voters = activePlayers.filter(voter => voter.votedFor === p.name).map(v => v.name);
                                
                                return (
                                  <div 
                                    key={p.name}
                                    className="bg-[#0c0c24]/50 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4"
                                  >
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-100 text-sm block">{p.name}</span>
                                      {voters.length > 0 ? (
                                        <p className="text-[10px] text-slate-400">
                                          Gewählt von: <span className="text-indigo-300 font-medium">{voters.join(', ')}</span>
                                        </p>
                                      ) : (
                                        <p className="text-[10px] text-slate-500 italic">Keine Stimmen erhalten</p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-400 font-mono">Stimmen:</span>
                                      <div className="bg-indigo-900/40 border border-indigo-500/30 px-3 py-1.5 rounded-xl font-mono font-extrabold text-sm text-indigo-300">
                                        {votesCount}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex justify-center pt-2">
                              <button
                                onClick={() => handleGMAction('resolveVoting')}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-10 rounded-xl text-sm tracking-wider shadow-md transition-all flex items-center gap-2 cursor-pointer"
                              >
                                <Vote className="w-4 h-4" />
                                ABSTIMMUNG AUFLÖSEN & WEITER
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        // Show voting process
                        return (
                          <div className="space-y-4">
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center">Stimmen-Status</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {activePlayers.map((p) => (
                                <div 
                                  key={p.name} 
                                  className={`rounded-xl border p-3 text-center transition-all ${
                                    p.votedFor 
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                                      : 'bg-[#0c0c24]/50 border-white/10 text-slate-400'
                                  }`}
                                >
                                  <div className="text-sm font-semibold truncate">{p.name}</div>
                                  <div className="text-[10px] mt-1 font-mono">
                                    {p.votedFor ? `Abgestimmt` : 'Wählt noch...'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </motion.div>
            )}

            {/* 5. TIEBREAKER STATE (STICHTFRAGE) */}
            {room.status === 'tiebreaker' && (
              <motion.div
                key="tiebreaker"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl border border-amber-500/30 p-8 space-y-6 shadow-xl"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-amber-500/10 rounded-full text-amber-400 mb-1">
                    <AlertTriangle className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-bold">Stichfrage nötig!</h3>
                  <p className="text-slate-300 text-sm">
                    Gleichstand in den Stimmen zwischen: <span className="text-amber-300 font-bold">{room.tiePlayers.join(' und ')}</span>
                  </p>
                </div>

                <div className="bg-[#0c0c24]/80 rounded-xl p-6 border border-white/10 space-y-5">
                  {!room.currentQuestion ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-slate-400 mb-4">Generiere eine Stichfrage, um das Stechen zu entscheiden:</p>
                      <button
                        onClick={() => handleGMAction('getQuestion', { category: 'Zufall' })}
                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-xl text-sm transition-all shadow-md cursor-pointer"
                      >
                        STICHTFRAGE ANFORDERN
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">STICHTFRAGE:</p>
                      <h4 className="text-xl font-medium leading-relaxed text-slate-100">{room.currentQuestion.question}</h4>
                      
                      <div className="bg-[#0c0c24] rounded-lg p-4 border border-white/10">
                        <span className="text-[10px] text-slate-500 block font-mono">Wahre Antwort:</span>
                        <p className="text-md font-bold text-emerald-400">{room.currentQuestion.answer}</p>
                      </div>

                      {/* Reroll Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleGMAction('rerollQuestion', { category: 'Zufall' })}
                          className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer uppercase tracking-wider"
                          title="Frage neu auswürfeln"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Frage neu auswürfeln
                        </button>
                      </div>

                      <p className="text-xs text-slate-400 italic text-center">
                        Stelle die Frage den beteiligten Spielern. Wer falsch antwortet oder langsamer ist, scheidet aus!
                      </p>

                      <div className="pt-4 border-t border-white/10 space-y-3">
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest text-center">Wen möchte der GM eliminieren?</p>
                        <div className="grid grid-cols-2 gap-3">
                          {room.tiePlayers.map(name => (
                            <button
                              key={name}
                              onClick={() => handleGMAction('resolveTieBreaker', { eliminatedPlayerName: name })}
                              className="bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/30 hover:border-red-500/50 py-3.5 px-4 rounded-xl text-xs font-bold transition-all text-center truncate cursor-pointer"
                            >
                              {name} eliminieren
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 6. FINALE STATE */}
            {room.status === 'finale' && (
              <motion.div
                key="finale"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-indigo-600/20 rounded-full text-blue-400 mb-1 border border-indigo-400/30">
                    <Award className="w-8 h-8 animate-bounce" />
                  </div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent uppercase tracking-wider">DAS FINALE</h3>
                  <p className="text-slate-300 text-sm">20 identische Fragen nacheinander. Der absolute Champion wird gekrönt!</p>
                </div>

                {/* Scoreboards of both Finalists */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(room.finaleScores).map(([name, scores]) => {
                    const scoreList = scores as number[];
                    const correctCount = scoreList.filter(s => s === 1).length;
                    const isActive = room.finaleActivePlayer === name;

                    // Calculate advantage for this finalist
                    const finalists = room.players.filter(p => !p.isEliminated);
                    const p1 = finalists[0];
                    const p2 = finalists[1];
                    let advantageVal = 0;
                    if (p1 && p2 && room.settings.finaleAdvantage !== false) {
                      const diff = Math.abs(p1.lives - p2.lives);
                      if (diff > 0) {
                        if (p1.lives > p2.lives && name === p1.name) advantageVal = diff;
                        if (p2.lives > p1.lives && name === p2.name) advantageVal = diff;
                      }
                    }

                    return (
                      <div 
                        key={name} 
                        className={`rounded-xl border p-4 transition-all ${
                          isActive 
                            ? 'bg-indigo-600/10 border-indigo-500 shadow-md' 
                            : 'bg-[#0c0c24]/60 border-white/10 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-bold text-slate-100 truncate block">{name}</span>
                            {advantageVal > 0 && (
                              <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded mt-1 inline-block">
                                Einstiegs-Vorteil: +{advantageVal} {advantageVal === 1 ? 'Punkt' : 'Punkte'} (Leben)
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-mono font-bold text-indigo-300">{correctCount} Richtig</span>
                        </div>
                        {/* Dot array for 20 questions */}
                        <div className="grid grid-cols-10 gap-1.5">
                          {scoreList.map((val, i) => (
                            <span 
                              key={i} 
                              className={`h-2 rounded-full border transition-all ${
                                val === 1 
                                  ? 'bg-emerald-500 border-emerald-400' 
                                  : val === 0 
                                  ? 'bg-red-500 border-red-400' 
                                  : 'bg-white/5 border-white/10'
                              }`}
                              title={`Frage ${i + 1}`}
                            ></span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Question & 5-Second Timer */}
                <div className="bg-slate-950 rounded-xl p-6 border border-white/10 space-y-6">
                  {room.finaleActivePlayer && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                      <div>
                        <span className="text-[10px] text-slate-500 font-mono block">AM ZUG:</span>
                        <span className="font-bold text-indigo-300 text-lg">{room.finaleActivePlayer}</span>
                      </div>
                      
                      {/* Timer Display */}
                      {!room.currentQuestionActiveAt && room.currentQuestion ? (
                        <button
                          onClick={() => handleGMAction('startFinaleTimer')}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-black animate-pulse cursor-pointer uppercase transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Timer starten (5s)
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-[#0c0c24] px-3 py-1.5 rounded-lg border border-white/10">
                          <Timer className={`w-4 h-4 ${timerSeconds <= 2 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                          <span className="text-xs text-slate-400">Verbleibende Zeit:</span>
                          <span className={`text-md font-mono font-bold ${timerSeconds <= 2 ? 'text-red-500' : 'text-slate-200'}`}>
                            {timerSeconds}s
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {!room.currentQuestion ? (
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-400 mb-4">Fordere Frage {room.finaleQuestionIndex + 1} an. Die Zeit (5s) startet erst, wenn du den Timer manuell aktivierst!</p>
                      <button
                        onClick={() => handleGMAction('getQuestion', { category: 'Zufall' })}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl text-sm transition-all cursor-pointer"
                      >
                        NÄCHSTE FRAGE ANZEIGEN
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-[10px] font-mono text-slate-500">FRAGE {room.finaleQuestionIndex + 1} von 20:</p>
                      <h4 className="text-xl font-medium leading-relaxed text-slate-100">{room.currentQuestion.question}</h4>
                      
                      {/* Answer Reveal Panel for GM */}
                      <div className="bg-[#0c0c24] rounded-lg p-4 border border-white/10">
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block mb-1">Richtige Antwort (bereits sichtbar für Spielleiter):</span>
                        <p className="text-md font-bold text-emerald-400">{room.currentQuestion.answer}</p>
                      </div>

                      {/* Reroll Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleGMAction('rerollQuestion', { category: 'Zufall' })}
                          className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer uppercase tracking-wider"
                          title="Frage neu auswürfeln"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Frage neu auswürfeln
                        </button>
                      </div>

                      {showWrongAnswerInput ? (
                        <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20 space-y-3 pt-4">
                          <div className="flex items-center gap-2 text-red-400">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">
                              {isTimeoutState ? 'Zeit abgelaufen!' : 'Antwort als Falsch gewertet'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Trage optional die gegebene falsche Antwort von <strong className="text-slate-200">{room.finaleActivePlayer}</strong> ein:
                          </p>
                          <input
                            type="text"
                            value={wrongAnswerText}
                            onChange={(e) => setWrongAnswerText(e.target.value)}
                            placeholder="z.B. Paris (Richtige Antwort: Berlin)"
                            className="w-full bg-[#0c0c24] text-slate-100 border border-white/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleGMAction('submitAnswer', { 
                                  isCorrect: false, 
                                  isTimeout: isTimeoutState, 
                                  givenAnswer: wrongAnswerText || (isTimeoutState ? 'Zeit abgelaufen' : 'Falsche Antwort') 
                                });
                                setShowWrongAnswerInput(false);
                                setWrongAnswerText('');
                                setIsTimeoutState(false);
                              }
                            }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                handleGMAction('submitAnswer', { 
                                  isCorrect: false, 
                                  isTimeout: isTimeoutState, 
                                  givenAnswer: wrongAnswerText || (isTimeoutState ? 'Zeit abgelaufen' : 'Falsche Antwort') 
                                });
                                setShowWrongAnswerInput(false);
                                setWrongAnswerText('');
                                setIsTimeoutState(false);
                              }}
                              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                            >
                              Antwort speichern & Weiter
                            </button>
                            <button
                              onClick={() => {
                                handleGMAction('submitAnswer', { 
                                  isCorrect: false, 
                                  isTimeout: isTimeoutState, 
                                  givenAnswer: isTimeoutState ? 'Zeit abgelaufen' : 'Falsche Antwort' 
                                });
                                setShowWrongAnswerInput(false);
                                setWrongAnswerText('');
                                setIsTimeoutState(false);
                              }}
                              className="px-3 bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10 rounded-lg text-[10px] uppercase font-bold transition-all cursor-pointer"
                            >
                              Überspringen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
                          <button
                            onClick={() => {
                              setIsTimeoutState(false);
                              setShowWrongAnswerInput(true);
                            }}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            FALSCH / ZEIT UM
                          </button>
                          <button
                            onClick={() => handleGMAction('submitAnswer', { isCorrect: true })}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            RICHTIG
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 7. ENDED / WINNER STATE */}
            {room.status === 'ended' && (
              <motion.div
                key="ended"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl border border-yellow-500/30 p-8 text-center space-y-6 shadow-2xl"
              >
                <div className="inline-flex p-4 bg-yellow-500/10 rounded-full text-yellow-400 mb-2">
                  <Award className="w-16 h-16 animate-pulse" />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest block">Der Gewinner steht fest!</span>
                  <h3 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-100 bg-clip-text text-transparent">
                    {room.winner}
                  </h3>
                  <p className="text-slate-300 text-sm max-w-sm mx-auto">
                    Herzlichen Glückwunsch! Du bist der am wenigsten dumme Spieler und hast dich bis ans Ende gekämpft!
                  </p>
                </div>

                {room.settings.clanId && (
                  <div className="bg-[#0c0c24]/50 rounded-xl p-4 border border-white/10 max-w-xs mx-auto">
                    <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Clan Statistiken</span>
                    <p className="text-xs text-emerald-400 font-semibold mt-1">Sieg im Clan-Leaderboard verbucht! 🏆</p>
                  </div>
                )}

                {/* 20 Questions Finale Evaluation Details */}
                {room.finaleScores && Object.keys(room.finaleScores).length > 0 && (
                  <div className="mt-8 text-left border-t border-white/10 pt-6 space-y-4 max-w-2xl mx-auto">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-3">
                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-300">
                        Finale-Auswertung (Frage für Frage)
                      </h4>
                      {/* Player Tabs */}
                      <div className="flex gap-2">
                        {Object.keys(room.finaleScores).map((pName) => {
                          const isActive = (selectedEvalPlayer || Object.keys(room.finaleScores!)[0]) === pName;
                          return (
                            <button
                              key={pName}
                              onClick={() => setSelectedEvalPlayer(pName)}
                              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-indigo-600 text-white border border-indigo-500 shadow-md'
                                  : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'
                              }`}
                            >
                              {pName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Questions list for selected player */}
                    {(() => {
                      const activeEvalP = selectedEvalPlayer || Object.keys(room.finaleScores!)[0];
                      const playerScores = room.finaleScores![activeEvalP] || [];
                      const playerGivenAnswers = (room.finaleGivenAnswers && room.finaleGivenAnswers[activeEvalP]) || [];
                      const questions = room.finaleQuestions || [];

                      if (!activeEvalP) return <p className="text-xs text-slate-500">Keine Daten verfügbar.</p>;

                      return (
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                          {questions.map((q, idx) => {
                            const score = playerScores[idx];
                            // Skip if -1 (means advantage offset was not part of their questions)
                            if (score === -1) return null;

                            const isCorrect = score === 1;
                            const wrongAnswer = playerGivenAnswers[idx];

                            return (
                              <div
                                key={idx}
                                className={`p-3.5 rounded-xl border transition-all ${
                                  isCorrect
                                    ? 'bg-emerald-500/5 border-emerald-500/20'
                                    : 'bg-red-500/5 border-red-500/20'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    {isCorrect ? (
                                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                    )}
                                  </div>
                                  <div className="space-y-1 flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                                        Frage {idx + 1} • {q.category || 'Allgemeinwissen'}
                                      </span>
                                      <span
                                        className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-black ${
                                          isCorrect
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-red-500/10 text-red-400'
                                        }`}
                                      >
                                        {isCorrect ? 'Richtig' : 'Falsch'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-200 font-semibold leading-relaxed">
                                      {q.question}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                      <div>
                                        <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Richtige Antwort:</span>
                                        <span className="text-xs text-emerald-300 font-bold">{q.answer}</span>
                                      </div>
                                      {!isCorrect && (
                                        <div>
                                          <span className="text-[9px] uppercase tracking-wider text-red-400/80 block">Eingegebene Antwort:</span>
                                          <span className="text-xs text-red-300 font-mono font-bold">
                                            {wrongAnswer || 'Falsche Antwort (kein Text)'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="pt-4 flex justify-center gap-3">
                  <button
                    onClick={() => handleGMAction('resetGame')}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-8 rounded-xl text-sm transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    REVANCHE (NEUSTART)
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN: CURRENT SCOREBOARD / LIVES DIRECTORY */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest border-b border-white/10 pb-2.5 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Spielfeld &amp; Leben
            </h3>

            {room.players.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Noch keine Spieler beigetreten.</p>
            ) : (
              <div className="space-y-3">
                {room.players.map((p, index) => {
                  const isCurrent = room.status === 'round' && room.activePlayerIndex === index;
                  return (
                    <div 
                      key={p.name} 
                      className={`rounded-xl p-3 border transition-all flex items-center justify-between gap-3 ${
                        p.isEliminated 
                          ? 'bg-red-950/10 border-red-950/30 text-slate-500 opacity-60' 
                          : isCurrent 
                          ? 'bg-indigo-600/15 border-indigo-400/40 text-white shadow-md' 
                          : 'bg-[#0c0c24]/50 border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="truncate min-w-0">
                        <span className="text-sm font-bold truncate block">{p.name}</span>
                        {p.isEliminated ? (
                          <span className="text-[10px] font-mono text-red-400 uppercase font-semibold">Ausgeschieden 💀</span>
                        ) : (
                          <div className="flex items-center gap-1 mt-1">
                            {Array.from({ length: room.settings.lives }).map((_, i) => (
                              <Heart 
                                key={i} 
                                className={`w-3.5 h-3.5 ${i < p.lives ? 'text-red-500 fill-red-500' : 'text-slate-800'}`} 
                              />
                            ))}
                            {p.swimLifeUsed && (
                              <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 rounded font-mono uppercase">🏊</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Score or Action column */}
                      <div className="text-right shrink-0">
                        {!p.isEliminated && (
                          <div className="text-xs font-mono">
                            {room.status === 'round' ? (
                              <>
                                <span className="text-[10px] text-slate-500 block">Runde:</span>
                                <span className="text-slate-300 font-bold">{p.roundQuestionsAsked || 0}</span>
                                <span className="text-slate-600">/{room.settings.cycleCount}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] text-slate-500 block">Gesamt:</span>
                                <span className="text-slate-300 font-bold">{p.totalCorrect}</span>
                                <span className="text-slate-600">/{p.totalQuestions}</span>
                              </>
                            )}
                          </div>
                        )}
                        {room.status === 'lobby' && (
                          <button
                            onClick={() => handleGMAction('removePlayer', { name: p.name })}
                            className="text-red-400 hover:text-red-300 text-xs p-1 hover:bg-red-500/10 rounded cursor-pointer"
                            title="Entfernen"
                          >
                            Entfernen
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
