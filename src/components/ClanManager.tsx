import React, { useState, useEffect } from 'react';
import { Clan, ClanPlayer } from '../types.ts';
import { Trophy, Users, Plus, Shield, RefreshCw, Lock, LogOut, Check, X, User, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClanManagerProps {
  selectedClanId: number | null;
  onSelectClan: (clanId: number | null) => void;
}

export default function ClanManager({ selectedClanId, onSelectClan }: ClanManagerProps) {
  // Current logged in user
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string; clanId: number | null } | null>(() => {
    const saved = localStorage.getItem('game_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [clans, setClans] = useState<Clan[]>([]);
  const [players, setPlayers] = useState<ClanPlayer[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  
  // Create Clan form state
  const [newClanName, setNewClanName] = useState('');
  
  // Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  // Sync user profile status
  const syncUserStatus = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/auth/me/${encodeURIComponent(currentUser.username)}`);
      if (res.ok) {
        const data = await res.json();
        const updated = { ...currentUser, clanId: data.clanId };
        localStorage.setItem('game_user', JSON.stringify(updated));
        setCurrentUser(updated);
        
        // Auto-select their clan if they have one and none is selected
        if (data.clanId && selectedClanId === null) {
          onSelectClan(data.clanId);
        }
      }
    } catch (err) {
      console.error('Error syncing user status:', err);
    }
  };

  // Fetch all clans
  const fetchClans = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clans');
      if (res.ok) {
        const data = await res.json();
        setClans(data);
      } else {
        setError('Fehler beim Laden der Clans.');
      }
    } catch (err) {
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch players in selected clan
  const fetchPlayers = async (clanId: number) => {
    try {
      const res = await fetch(`/api/clans/${clanId}/players`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data);
      }
    } catch (err) {
      console.error('Failed to fetch clan players:', err);
    }
  };

  // Fetch join requests for a clan (for owner)
  const fetchJoinRequests = async (clanId: number) => {
    try {
      const res = await fetch(`/api/clans/${clanId}/requests`);
      if (res.ok) {
        const data = await res.json();
        setJoinRequests(data);
      }
    } catch (err) {
      console.error('Failed to fetch join requests:', err);
    }
  };

  useEffect(() => {
    fetchClans();
    if (currentUser) {
      syncUserStatus();
    }
  }, []);

  useEffect(() => {
    if (selectedClanId !== null) {
      fetchPlayers(selectedClanId);
      
      // If current user is owner of this clan, fetch requests
      const clan = clans.find(c => c.id === selectedClanId);
      if (clan && currentUser && clan.owner_id === currentUser.id) {
        fetchJoinRequests(selectedClanId);
      } else {
        setJoinRequests([]);
      }
    } else {
      setPlayers([]);
      setJoinRequests([]);
    }
    setRequestStatus(null);
  }, [selectedClanId, clans, currentUser]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAuthSuccess(null);
    if (!authUsername.trim() || !authPassword.trim()) {
      setError('Bitte fülle alle Felder aus.');
      return;
    }

    const url = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    setIsLoading(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername.trim(), password: authPassword })
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('game_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setAuthSuccess(authMode === 'login' ? 'Erfolgreich eingeloggt!' : 'Konto erfolgreich erstellt!');
        setAuthUsername('');
        setAuthPassword('');
        
        if (data.user.clanId) {
          onSelectClan(data.user.clanId);
        }
        
        // Refresh clans to update potential ownership states
        await fetchClans();
      } else {
        setError(data.error || 'Fehler bei der Anmeldung.');
      }
    } catch (err) {
      setError('Verbindung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('game_user');
    setCurrentUser(null);
    onSelectClan(null);
    setAuthSuccess(null);
    setJoinRequests([]);
    setError(null);
  };

  const handleCreateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClanName.trim() || !currentUser) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClanName.trim(), ownerId: currentUser.id })
      });

      if (res.ok) {
        const data = await res.json();
        setClans(prev => [...prev, data]);
        onSelectClan(data.id);
        setNewClanName('');
        
        // Update user's local profile since they now own/belong to this clan
        const updatedUser = { ...currentUser, clanId: data.id };
        localStorage.setItem('game_user', JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Fehler beim Erstellen des Clans.');
      }
    } catch (err) {
      setError('Verbindung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendJoinRequest = async () => {
    if (!selectedClanId || !currentUser) return;
    setRequestStatus(null);
    setError(null);

    try {
      const res = await fetch(`/api/clans/${selectedClanId}/join-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });

      if (res.ok) {
        setRequestStatus('Beitrittsanfrage wurde gesendet und wartet auf Bestätigung.');
      } else {
        const data = await res.json();
        setError(data.error || 'Anfrage konnte nicht gesendet werden.');
      }
    } catch (err) {
      setError('Verbindung fehlgeschlagen.');
    }
  };

  const handleRespondRequest = async (requestId: number, action: 'accepted' | 'denied') => {
    if (!selectedClanId) return;
    setError(null);
    try {
      const res = await fetch(`/api/clans/${selectedClanId}/requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (res.ok) {
        fetchJoinRequests(selectedClanId);
        fetchPlayers(selectedClanId);
      } else {
        setError('Aktion konnte nicht ausgeführt werden.');
      }
    } catch (err) {
      setError('Verbindung fehlgeschlagen.');
    }
  };

  const selectedClan = clans.find(c => c.id === selectedClanId);
  const isOwnerOfSelectedClan = selectedClan && currentUser && selectedClan.owner_id === currentUser.id;
  const isMemberOfSelectedClan = currentUser && currentUser.clanId === selectedClanId;

  return (
    <div id="clan-manager-container" className="bg-[#0b0c24]/85 backdrop-blur-xl rounded-2xl border border-white/10 p-6 shadow-2xl text-white relative overflow-hidden">
      
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <h3 className="text-xl font-extrabold flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
          <Shield className="w-5 h-5 text-blue-400" />
          Clans &amp; Bestenlisten
        </h3>
        <button 
          onClick={() => { fetchClans(); if (currentUser) syncUserStatus(); }}
          className="text-slate-400 hover:text-indigo-300 transition-colors p-2 rounded-xl hover:bg-white/5 cursor-pointer"
          title="Aktualisieren"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm mb-6">
          {error}
        </div>
      )}

      {authSuccess && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 rounded-xl p-4 text-sm mb-6">
          {authSuccess}
        </div>
      )}

      {requestStatus && (
        <div className="bg-blue-500/15 border border-blue-500/20 text-blue-200 rounded-xl p-4 text-sm mb-6">
          {requestStatus}
        </div>
      )}

      {/* SECTION 1: AUTHENTICATION */}
      {!currentUser ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
          <div className="flex border-b border-white/10 mb-4">
            <button
              onClick={() => { setAuthMode('login'); setError(null); }}
              className={`flex-1 py-2.5 text-center text-sm font-semibold transition-all cursor-pointer ${
                authMode === 'login' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-white'
              }`}
            >
              Einloggen
            </button>
            <button
              onClick={() => { setAuthMode('register'); setError(null); }}
              className={`flex-1 py-2.5 text-center text-sm font-semibold transition-all cursor-pointer ${
                authMode === 'register' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-white'
              }`}
            >
              Konto erstellen
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nickname / Benutzername
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Dein Spielername"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full bg-[#05051a]/60 border border-white/10 focus:border-indigo-400/50 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Passwort
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-[#05051a]/60 border border-white/10 focus:border-indigo-400/50 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold tracking-wide transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {authMode === 'login' ? 'Einloggen' : 'Konto erstellen'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Angemeldet als:</div>
              <div className="text-sm font-extrabold text-white">{currentUser.username}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-300 border border-red-500/20 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Abmelden
          </button>
        </div>
      )}

      {/* SECTION 2: CLAN SELECTION & CREATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Clan Auswählen
          </label>
          <div className="flex flex-col gap-2">
            <select
              value={selectedClanId || ''}
              onChange={(e) => onSelectClan(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full bg-[#05051a] border border-white/10 focus:border-indigo-400/50 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none transition-colors"
            >
              <option value="">-- Kein Clan (Nur lokales Spiel) --</option>
              {clans.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {currentUser && c.owner_id === currentUser.id ? ' (Dein Clan)' : ''}
                </option>
              ))}
            </select>

            {/* SEND JOIN REQUEST BUTTON */}
            {selectedClanId !== null && currentUser && !isMemberOfSelectedClan && !isOwnerOfSelectedClan && (
              <button
                onClick={handleSendJoinRequest}
                className="w-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer"
              >
                Beitrittsanfrage für diesen Clan senden
              </button>
            )}
            
            {selectedClanId !== null && isMemberOfSelectedClan && (
              <span className="text-xs text-emerald-400 font-medium text-center bg-emerald-500/10 border border-emerald-500/25 rounded-xl py-2">
                ✓ Du bist Mitglied dieses Clans
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Neuen Clan gründen
          </label>
          {currentUser ? (
            <form onSubmit={handleCreateClan} className="flex gap-2">
              <input
                type="text"
                placeholder="z.B. Die Quiz-Elite"
                value={newClanName}
                onChange={(e) => setNewClanName(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-400/50 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading || !newClanName.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="bg-[#05051a]/40 border border-white/5 rounded-xl p-3 text-xs text-slate-400 text-center flex items-center justify-center gap-1.5 h-[46px]">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              Bitte einloggen, um einen Clan zu gründen.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: OWNER'S JOIN REQUESTS LIST */}
      {selectedClanId !== null && isOwnerOfSelectedClan && joinRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 mb-8"
        >
          <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-1.5 mb-3">
            <Users className="w-4 h-4" />
            Ausstehende Beitrittsanfragen ({joinRequests.length})
          </h4>
          <div className="space-y-2">
            {joinRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between bg-[#05051a]/60 border border-white/5 rounded-xl p-3">
                <span className="text-sm font-semibold">{req.username}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleRespondRequest(req.id, 'accepted')}
                    className="p-1.5 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 rounded-lg border border-emerald-500/25 transition-all cursor-pointer"
                    title="Akzeptieren"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRespondRequest(req.id, 'denied')}
                    className="p-1.5 bg-red-500/15 hover:bg-red-500/30 text-red-300 rounded-lg border border-red-500/25 transition-all cursor-pointer"
                    title="Ablehnen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* SECTION 4: LEADERS BOARD */}
      {selectedClanId !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-white/10 pt-6"
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <h4 className="text-md font-bold text-slate-200 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400 animate-bounce" />
              Clan-Rangliste ({players.length} Spieler)
            </h4>
          </div>

          {players.length === 0 ? (
            <div className="bg-[#05051a]/30 rounded-2xl p-8 border border-white/5 text-center">
              <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-300">Noch keine Spieler im Clan registriert.</p>
              <p className="text-xs text-slate-400 mt-1">Gibt anderen Spielern Bescheid, Beitrittsanfragen zu senden!</p>
            </div>
          ) : (
            <div className="bg-[#05051a]/55 rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 bg-white/5 px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-5">Spieler</span>
                <span className="col-span-2 text-center">Spiele</span>
                <span className="col-span-2 text-center">Siege</span>
                <span className="col-span-2 text-center">Quote</span>
              </div>
              <div className="divide-y divide-white/10 max-h-60 overflow-y-auto">
                {players.map((p, index) => {
                  const winRate = p.rounds_played > 0 ? Math.round((p.wins / p.rounds_played) * 100) : 0;
                  return (
                    <div 
                      key={p.id} 
                      className={`grid grid-cols-12 px-4 py-3 text-sm items-center hover:bg-white/5 transition-colors ${
                        index === 0 ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      <span className="col-span-1 text-center font-bold">
                        {index === 0 ? (
                          <span className="text-amber-400">👑</span>
                        ) : index === 1 ? (
                          <span className="text-slate-300">🥈</span>
                        ) : index === 2 ? (
                          <span className="text-amber-600">🥉</span>
                        ) : (
                          <span className="text-slate-500">{index + 1}</span>
                        )}
                      </span>
                      <span className="col-span-5 font-bold text-slate-100 truncate flex items-center gap-1.5">
                        {p.name}
                        {currentUser && p.name === currentUser.username && (
                          <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/25 px-1.5 py-0.5 rounded text-indigo-300 font-mono">Du</span>
                        )}
                      </span>
                      <span className="col-span-2 text-center text-slate-300">{p.rounds_played}</span>
                      <span className="col-span-2 text-center text-emerald-400 font-semibold">{p.wins}</span>
                      <span className="col-span-2 text-center font-mono text-xs text-indigo-300">{winRate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
