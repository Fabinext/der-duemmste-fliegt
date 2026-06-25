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
    <div className="min-h-screen bg-ral-bg text-ral-charcoal font-sans antialiased selection:bg-ral1001/30 selection:text-ral-charcoal relative overflow-x-hidden">
      
      {/* Live Online Visitors Counter */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-ral1001-light/80 border border-ral1001/40 px-3 py-1.5 rounded-full text-[10px] font-bold text-ral-charcoal-light shadow-sm transition-all">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
        </span>
        <span className="font-mono uppercase tracking-wider">{onlineCount} {onlineCount === 1 ? 'Spieler' : 'Spieler'} Online</span>
      </div>
      
      {/* Absolute Ambient Glow Elements - REMOVED for clean minimalistic RAL design */}

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        
        {/* LANDING PAGE / HOME VIEW */}
        {activeView === 'home' && (
          <div className="space-y-12">
            
            {/* Header / Logo Section */}
            <div className="text-center space-y-4 max-w-xl mx-auto pt-8">
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight uppercase text-ral-charcoal">
                Der Dümmste fliegt
              </h1>
              <p className="text-ral-charcoal-light text-sm leading-relaxed max-w-lg mx-auto">
                Beantworte Fragen, stimme taktisch gegen deine Mitspieler ab, überlebe das Stechen und triumphiere im Finale!
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm max-w-xl mx-auto text-center font-medium">
                {error}
              </div>
            )}

            {/* Selection Grid for GM / Player */}
            <div className="max-w-4xl mx-auto space-y-4">
              <span className="text-xs font-bold text-ral1001-dark uppercase tracking-widest text-center block">Spielmodus wählen</span>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Card 1: Local Play (1 Device) */}
                <button
                  onClick={() => handleStartGM('local')}
                  disabled={isLoading}
                  className="group relative text-left bg-white border border-ral-sand hover:border-ral1001 hover:shadow-md rounded-xl p-6 transition-all duration-200 focus:outline-none cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="inline-flex p-3 bg-ral1001-light text-ral1001-dark rounded-lg border border-ral1001/30 transition-all">
                      <Tv className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-sm font-bold text-ral-charcoal group-hover:text-ral1001-dark transition-colors flex items-center gap-1.5">
                        Lokal (1 Bildschirm)
                        <span className="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded border border-emerald-200 uppercase font-semibold font-mono">Offline</span>
                      </h2>
                      <p className="text-xs text-ral-charcoal-light leading-relaxed">
                        Spiele direkt in einem Raum. Ein Spielleiter leitet das Spiel, stellt Fragen laut vor und verwaltet alle Spieler & Abstimmungen manuell direkt am Bildschirm. Keine Handys benötigt!
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 text-[10px] font-bold text-ral1001-dark group-hover:text-ral-charcoal font-mono tracking-wider uppercase transition-colors">
                    &rarr; Lokales Spiel starten
                  </div>
                </button>

                {/* Card 2: Online Host */}
                <button
                  onClick={() => handleStartGM('lobby')}
                  disabled={isLoading}
                  className="group relative text-left bg-white border border-ral-sand hover:border-ral1001 hover:shadow-md rounded-xl p-6 transition-all duration-200 focus:outline-none cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="inline-flex p-3 bg-ral1001-light text-ral1001-dark rounded-lg border border-ral1001/30 transition-all">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-sm font-bold text-ral-charcoal group-hover:text-ral1001-dark transition-colors flex items-center gap-1.5">
                        Online hosten
                        <span className="bg-indigo-50 text-indigo-700 text-[8px] px-1.5 py-0.5 rounded border border-indigo-200 uppercase font-semibold font-mono">Online</span>
                      </h2>
                      <p className="text-xs text-ral-charcoal-light leading-relaxed">
                        Hoste ein Spiel auf dem großen Screen (TV/Beamer). Spieler treten live mit ihren eigenen Handys über einen QR-Code/Raumcode bei, erhalten Fragen und stimmen geheim über ihr Handy ab.
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 text-[10px] font-bold text-ral1001-dark group-hover:text-ral-charcoal font-mono tracking-wider uppercase transition-colors">
                    &rarr; Online Lobby hosten
                  </div>
                </button>

                {/* Card 3: Online Player */}
                <button
                  onClick={() => setActiveView('player')}
                  className="group relative text-left bg-white border border-ral-sand hover:border-ral1001 hover:shadow-md rounded-xl p-6 transition-all duration-200 focus:outline-none cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="inline-flex p-3 bg-ral1001-light text-ral1001-dark rounded-lg border border-ral1001/30 transition-all">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-sm font-bold text-ral-charcoal group-hover:text-ral1001-dark transition-colors">Als Mitspieler beitreten</h2>
                      <p className="text-xs text-ral-charcoal-light leading-relaxed">
                        Gib den Raumcode ein, der auf dem Hauptbildschirm (Host) angezeigt wird, um dich mit deinem Smartphone zu verbinden. Stimme mobil ab und verfolge deinen Status live!
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 text-[10px] font-bold text-ral1001-dark group-hover:text-ral-charcoal font-mono tracking-wider uppercase transition-colors">
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
            <div className="max-w-3xl mx-auto bg-white border border-ral-sand rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setShowRules(!showRules)}
                className="w-full flex items-center justify-between p-4 text-xs font-bold text-ral-charcoal-light uppercase tracking-widest hover:bg-ral-bg transition-colors cursor-pointer"
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
                    <div className="p-6 pt-0 border-t border-ral-sand grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-ral-charcoal-light leading-relaxed">
                      <div className="space-y-3 pt-4 border-r border-ral-sand/40 pr-4">
                        <p>
                          <strong className="text-ral-charcoal">1. Die Fragerunde:</strong> Der Spielleiter stellt jedem Spieler nacheinander Fragen. Die Antworten werden laut im Raum oder Chat gegeben. Wer richtig antwortet, behält seine Leben. Wer falsch antwortet, verliert kein Leben direkt, sondern schadet seiner Runden-Statistik!
                        </p>
                        <p>
                          <strong className="text-ral-charcoal">2. Die Abstimmung:</strong> Am Ende der Fragerunde bestimmen die Spieler geheim oder per Handzeichen (lokal), wer &quot;Der Dümmste&quot; ist. Der Spieler mit den meisten Stimmen verliert 1 wertvolles Leben!
                        </p>
                      </div>
                      <div className="space-y-3 pt-4">
                        <p>
                          <strong className="text-ral-charcoal">3. Schwimmer-Regel:</strong> Verliert ein Spieler sein letztes Leben, scheidet er normalerweise aus. Ist die &quot;Schwimmer-Regel&quot; aktiv, darf der allererste Spieler auf 0 Leben mit 1 Bonusleben &quot;weiter schwimmen&quot;.
                        </p>
                        <p>
                          <strong className="text-ral-charcoal">4. Das Finale:</strong> Sobald nur noch 2 Spieler übrig sind, beginnt das Finale: 20 identische Fragen nacheinander mit jeweils nur 5 Sekunden Antwortzeit pro Frage. Wer am Ende mehr Fragen richtig beantwortet, gewinnt das Spiel!
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
