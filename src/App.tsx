import React, { useState, useEffect } from 'react';
import { Shield, Tv, Smartphone, Sparkles, BookOpen, Trophy, ChevronDown, ChevronUp, Users, Laptop } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ClanManager from './components/ClanManager.tsx';
import GMView from './components/GMView.tsx';
import PlayerView from './components/PlayerView.tsx';

export default function App() {
  const [activeView, setActiveView] = useState<'home' | 'gm' | 'player'>('home');
  const [selectedClanId, setSelectedClanId] = useState<number | null>(null);
  const [gmRoomCode, setGmRoomCode] = useState('');
  const [gmToken, setGmToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [visitorId] = useState(() => {
    try {
      let id = sessionStorage.getItem('visitor_id');
      if (!id) {
        id = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('visitor_id', id);
      }
      return id;
    } catch {
      return Math.random().toString(36).substring(2);
    }
  });

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/online-count?visitorId=${visitorId}`);
        if (res.ok) {
          const data = await res.json();
          setOnlineCount(data.count);
        }
      } catch (err) {
        // Fail silently
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => clearInterval(interval);
  }, [visitorId]);

  // Initialize a new game room for the Game Master
  const handleStartGM = async (gameMode: 'local' | 'lobby') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameMode })
      });
      if (res.ok) {
        const data = await res.json();
        setGmRoomCode(data.roomCode);
        setGmToken(data.gmSessionId);

        // If a clan is selected, bind it instantly to the room settings
        if (selectedClanId !== null) {
          await fetch(`/api/room/${data.roomCode}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'updateSettings',
              payload: { clanId: selectedClanId, gameMode },
              token: data.gmSessionId
            })
          });
        }

        setActiveView('gm');
      } else {
        setError('Fehler beim Erstellen des Raumes auf dem Server.');
      }
    } catch (err) {
      setError('Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05051a] text-white font-sans antialiased selection:bg-indigo-500/30 selection:text-white relative overflow-x-hidden">
      
      {/* Live Online Visitors Counter */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-indigo-950/50 hover:bg-indigo-950/70 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-200 shadow-xl transition-all">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider">{onlineCount} {onlineCount === 1 ? 'Spieler' : 'Spieler'} Online</span>
      </div>
      
      {/* Absolute Ambient Glow Elements from Design */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-violet-600/20 blur-[150px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[180px]"></div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        
        {/* LANDING PAGE / HOME VIEW */}
        {activeView === 'home' && (
          <div className="space-y-12">
            
            {/* Header / Logo Section */}
            <div className="text-center space-y-3 max-w-xl mx-auto pt-8">
              <h1 className="text-5xl sm:text-6xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-indigo-500 drop-shadow-md">
                Der Dümmste fliegt
              </h1>
              <p className="text-slate-300 text-sm sm:text-sm leading-relaxed max-w-lg mx-auto">
                Beantworte Fragen, stimme taktisch gegen deine Mitspieler ab, überlebe das Stechen und triumphiere im Finale!
              </p>
            </div>

            {error && (
              <div className="bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-200 rounded-xl p-4 text-sm max-w-xl mx-auto text-center">
                {error}
              </div>
            )}

            {/* Selection Grid for GM / Player */}
            <div className="max-w-4xl mx-auto space-y-4">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest text-center block">Spielmodus wählen</span>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Card 1: Local Play (1 Device) */}
                <button
                  onClick={() => handleStartGM('local')}
                  disabled={isLoading}
                  className="group relative text-left bg-gradient-to-b from-indigo-950/20 to-blue-950/10 backdrop-blur-xl border border-white/10 hover:border-emerald-500/50 hover:bg-white/10 rounded-2xl p-6 shadow-xl transition-all duration-300 focus:outline-none cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="inline-flex p-3.5 bg-emerald-500/15 group-hover:bg-emerald-500/35 text-emerald-300 rounded-xl border border-emerald-500/25 transition-all">
                      <Tv className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-md font-bold text-white group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                        Lokal (1 Bildschirm)
                        <span className="bg-emerald-500/10 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase font-semibold font-mono">Offline</span>
                      </h2>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Spiele direkt in einem Raum. Ein Spielleiter leitet das Spiel, stellt Fragen laut vor und verwaltet alle Spieler & Abstimmungen manuell direkt am Bildschirm. Keine Handys benötigt!
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 text-[10px] font-semibold text-slate-400 group-hover:text-emerald-300 font-mono tracking-wider uppercase transition-colors">
                    &rarr; Lokales Spiel starten
                  </div>
                </button>

                {/* Card 2: Online Host */}
                <button
                  onClick={() => handleStartGM('lobby')}
                  disabled={isLoading}
                  className="group relative text-left bg-gradient-to-b from-indigo-950/20 to-violet-950/10 backdrop-blur-xl border border-white/10 hover:border-indigo-400/50 hover:bg-white/10 rounded-2xl p-6 shadow-xl transition-all duration-300 focus:outline-none cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="inline-flex p-3.5 bg-indigo-600/20 group-hover:bg-indigo-600/40 text-blue-300 rounded-xl border border-indigo-400/30 transition-all">
                      <Laptop className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-md font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                        Online hosten
                        <span className="bg-indigo-500/10 text-indigo-300 text-[9px] px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase font-semibold font-mono">Online</span>
                      </h2>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Hoste ein Spiel auf dem großen Screen (TV/Beamer). Spieler treten live mit ihren eigenen Handys über einen QR-Code/Raumcode bei, erhalten Fragen und stimmen geheim über ihr Handy ab.
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 text-[10px] font-semibold text-slate-400 group-hover:text-blue-300 font-mono tracking-wider uppercase transition-colors">
                    &rarr; Online Lobby hosten
                  </div>
                </button>

                {/* Card 3: Online Player */}
                <button
                  onClick={() => setActiveView('player')}
                  className="group relative text-left bg-gradient-to-b from-indigo-950/20 to-purple-950/10 backdrop-blur-xl border border-white/10 hover:border-purple-400/50 hover:bg-white/10 rounded-2xl p-6 shadow-xl transition-all duration-300 focus:outline-none cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="inline-flex p-3.5 bg-purple-600/20 group-hover:bg-purple-600/40 text-purple-300 rounded-xl border border-purple-400/30 transition-all">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-md font-bold text-white group-hover:text-purple-300 transition-colors">Als Mitspieler beitreten</h2>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Gib den Raumcode ein, der auf dem Hauptbildschirm (Host) angezeigt wird, um dich mit deinem Smartphone zu verbinden. Stimme mobil ab und verfolge deinen Status live!
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 text-[10px] font-semibold text-slate-400 group-hover:text-purple-300 font-mono tracking-wider uppercase transition-colors">
                    &rarr; Spielraum beitreten
                  </div>
                </button>

              </div>
            </div>

            {/* Persistent Database Clan Leaderboard manager */}
            <div className="max-w-3xl mx-auto">
              <ClanManager 
                selectedClanId={selectedClanId} 
                onSelectClan={setSelectedClanId} 
              />
            </div>

            {/* Collapsible Detailed Instructions Panel */}
            <div className="max-w-3xl mx-auto bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden transition-all duration-300">
              <button
                onClick={() => setShowRules(!showRules)}
                className="w-full flex items-center justify-between p-5 text-sm font-semibold text-indigo-300 uppercase tracking-widest hover:bg-white/5 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  Spielregeln &amp; Ablauf einblenden
                </span>
                {showRules ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
              </button>
              
              <AnimatePresence initial={false}>
                {showRules && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                  >
                    <div className="p-6 pt-0 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
                      <div className="space-y-3 pt-4">
                        <p>
                          <strong>1. Die Fragerunde:</strong> Der Spielleiter stellt jedem Spieler nacheinander Fragen. Die Antworten werden laut im Raum oder Chat gegeben. Wer richtig antwortet, behält seine Leben. Wer falsch antwortet, verliert kein Leben direkt, sondern schadet seiner Runden-Statistik!
                        </p>
                        <p>
                          <strong>2. Die Abstimmung:</strong> Am Ende der Fragerunde bestimmen die Spieler geheim oder per Handzeichen (lokal), wer &quot;Der Dümmste&quot; ist. Der Spieler mit den meisten Stimmen verliert 1 wertvolles Leben!
                        </p>
                      </div>
                      <div className="space-y-3 pt-4">
                        <p>
                          <strong>3. Schwimmer-Regel:</strong> Verliert ein Spieler sein letztes Leben, scheidet er normalerweise aus. Ist die &quot;Schwimmer-Regel&quot; aktiv, darf der allererste Spieler auf 0 Leben mit 1 Bonusleben &quot;weiter schwimmen&quot;.
                        </p>
                        <p>
                          <strong>4. Das Finale:</strong> Sobald nur noch 2 Spieler übrig sind, beginnt das Finale: 20 identische Fragen nacheinander mit jeweils nur 5 Sekunden Antwortzeit pro Frage. Wer am Ende mehr Fragen richtig beantwortet, gewinnt das Spiel!
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        )}

        {/* GAME MASTER DASHBOARD VIEW */}
        {activeView === 'gm' && (
          <GMView 
            roomCode={gmRoomCode} 
            gmToken={gmToken} 
            onExit={() => {
              setActiveView('home');
              setGmRoomCode('');
              setGmToken('');
            }} 
          />
        )}

        {/* MOBILE PLAYER DEVICE VIEW */}
        {activeView === 'player' && (
          <PlayerView 
            onBackToHome={() => setActiveView('home')} 
          />
        )}

      </div>
    </div>
  );
}
