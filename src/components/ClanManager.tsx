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
    <div id="clan-manager-container" className="bg-white rounded-xl border border-ral-sand p-6 shadow-sm text-ral-charcoal relative overflow-hidden">
      
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-ral-sand">
        <h3 className="text-md font-bold uppercase tracking-wider flex items-center gap-2 text-ral-charcoal">
          <Shield className="w-4 h-4 text-ral1001-dark" />
          Clans &amp; Bestenlisten
        </h3>
        <button 
          onClick={() => { fetchClans(); if (currentUser) syncUserStatus(); }}
          className="text-ral-charcoal-light hover:text-ral1001-dark hover:bg-ral-bg transition-colors p-2 rounded-lg cursor-pointer"
          title="Aktualisieren"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-xs mb-6 font-semibold">
          {error}
        </div>
      )}

      {authSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 text-xs mb-6 font-semibold">
          {authSuccess}
        </div>
      )}

      {requestStatus && (
        <div className="bg-ral1001-light border border-ral1001/30 text-ral1001-dark rounded-lg p-4 text-xs mb-6 font-semibold">
          {requestStatus}
        </div>
      )}

      {/* SECTION 1: AUTHENTICATION */}
      {!currentUser ? (
        <div className="bg-ral-bg border border-ral-sand rounded-xl p-5 mb-8">
          <div className="flex border-b border-ral-sand mb-4">
            <button
              onClick={() => { setAuthMode('login'); setError(null); }}
              className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                authMode === 'login' ? 'text-ral1001-dark border-b-2 border-ral1001' : 'text-ral-charcoal-light hover:text-ral-charcoal'
              }`}
            >
              Einloggen
            </button>
            <button
              onClick={() => { setAuthMode('register'); setError(null); }}
              className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                authMode === 'register' ? 'text-ral1001-dark border-b-2 border-ral1001' : 'text-ral-charcoal-light hover:text-ral-charcoal'
              }`}
            >
              Konto erstellen
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-ral-charcoal-light uppercase tracking-wider mb-1.5">
                Nickname / Benutzername
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 w-4 h-4 text-ral-charcoal-light/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Dein Spielername"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full bg-white border border-ral-sand focus:border-ral1001 rounded-lg pl-10 pr-4 py-2 text-xs text-ral-charcoal outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-ral-charcoal-light uppercase tracking-wider mb-1.5">
                Passwort
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-ral-charcoal-light/60 pointer-events-none" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-white border border-ral-sand focus:border-ral1001 rounded-lg pl-10 pr-4 py-2 text-xs text-ral-charcoal outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-ral1001 hover:bg-ral1001-dark disabled:opacity-50 text-white rounded-lg py-2.5 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              {authMode === 'login' ? 'Einloggen' : 'Konto erstellen'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-ral-bg border border-ral-sand rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-ral1001-light text-ral1001-dark rounded-lg border border-ral1001/20">
              <User className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-ral-charcoal-light uppercase tracking-wider">Angemeldet als:</div>
              <div className="text-xs font-bold text-ral-charcoal">{currentUser.username}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            Abmelden
          </button>
        </div>
      )}

      {/* SECTION 2: CLAN SELECTION & CREATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-[10px] font-bold text-ral-charcoal-light uppercase tracking-wider mb-2">
            Clan Auswählen
          </label>
          <div className="flex flex-col gap-2">
            <select
              value={selectedClanId || ''}
              onChange={(e) => onSelectClan(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full bg-ral-bg border border-ral-sand focus:border-ral1001 rounded-lg px-3 py-2 text-xs text-ral-charcoal outline-none transition-colors"
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
                className="w-full bg-ral1001-light hover:bg-ral1001/20 text-ral1001-dark border border-ral1001/30 rounded-lg py-2 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Beitrittsanfrage für diesen Clan senden
              </button>
            )}
            
            {selectedClanId !== null && isMemberOfSelectedClan && (
              <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider text-center bg-emerald-50 border border-emerald-200 rounded-lg py-2">
                ✓ Du bist Mitglied dieses Clans
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-ral-charcoal-light uppercase tracking-wider mb-2">
            Neuen Clan gründen
          </label>
          {currentUser ? (
            <form onSubmit={handleCreateClan} className="flex gap-2">
              <input
                type="text"
                placeholder="z.B. Die Quiz-Elite"
                value={newClanName}
                onChange={(e) => setNewClanName(e.target.value)}
                className="flex-1 bg-ral-bg border border-ral-sand focus:border-ral1001 rounded-lg px-3 py-2 text-xs text-ral-charcoal outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading || !newClanName.trim()}
                className="bg-ral1001 hover:bg-ral1001-dark disabled:opacity-50 text-white rounded-lg px-3 py-2 text-xs font-bold transition-colors flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="bg-ral-bg border border-ral-sand rounded-lg p-3 text-[11px] text-ral-charcoal-light text-center flex items-center justify-center gap-1.5 h-[38px]">
              <Lock className="w-3.5 h-3.5 text-ral1001-dark" />
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
          className="bg-ral1001-light/40 border border-ral1001/30 rounded-xl p-4 mb-8"
        >
          <h4 className="text-xs font-bold text-ral1001-dark uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Users className="w-3.5 h-3.5" />
            Ausstehende Beitrittsanfragen ({joinRequests.length})
          </h4>
          <div className="space-y-2">
            {joinRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between bg-white border border-ral-sand rounded-lg p-3">
                <span className="text-xs font-bold text-ral-charcoal">{req.username}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleRespondRequest(req.id, 'accepted')}
                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-all cursor-pointer"
                    title="Akzeptieren"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRespondRequest(req.id, 'denied')}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg border border-red-200 transition-all cursor-pointer"
                    title="Ablehnen"
                  >
                    <X className="w-3.5 h-3.5" />
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
          className="border-t border-ral-sand pt-6"
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <h4 className="text-xs font-bold text-ral-charcoal uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              Clan-Rangliste ({players.length} Spieler)
            </h4>
          </div>

          {players.length === 0 ? (
            <div className="bg-ral-bg rounded-xl p-8 border border-ral-sand text-center">
              <Users className="w-6 h-6 text-ral-charcoal-light/40 mx-auto mb-2" />
              <p className="text-xs font-semibold text-ral-charcoal">Noch keine Spieler im Clan registriert.</p>
              <p className="text-[10px] text-ral-charcoal-light mt-1">Gibt anderen Spielern Bescheid, Beitrittsanfragen zu senden!</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-ral-sand overflow-hidden">
              <div className="grid grid-cols-12 bg-ral-bg px-4 py-2 text-[9px] font-bold text-ral-charcoal-light uppercase tracking-wider border-b border-ral-sand">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-5">Spieler</span>
                <span className="col-span-2 text-center">Spiele</span>
                <span className="col-span-2 text-center">Siege</span>
                <span className="col-span-2 text-center font-mono">Quote</span>
              </div>
              <div className="divide-y divide-ral-sand max-h-60 overflow-y-auto">
                {players.map((p, index) => {
                  const winRate = p.rounds_played > 0 ? Math.round((p.wins / p.rounds_played) * 100) : 0;
                  return (
                    <div 
                      key={p.id} 
                      className={`grid grid-cols-12 px-4 py-2.5 text-xs items-center hover:bg-ral-bg transition-colors ${
                        index === 0 ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      <span className="col-span-1 text-center font-bold">
                        {index === 0 ? (
                          <span className="text-amber-500 text-xs">👑</span>
                        ) : index === 1 ? (
                          <span className="text-slate-400 text-xs">🥈</span>
                        ) : index === 2 ? (
                          <span className="text-amber-700 text-xs">🥉</span>
                        ) : (
                          <span className="text-ral-charcoal-light/60 font-mono text-[10px]">{index + 1}</span>
                        )}
                      </span>
                      <span className="col-span-5 font-bold text-ral-charcoal truncate flex items-center gap-1.5">
                        {p.name}
                        {currentUser && p.name === currentUser.username && (
                          <span className="text-[8px] bg-ral1001-light border border-ral1001/30 px-1.5 py-0.5 rounded text-ral1001-dark font-mono uppercase tracking-wider font-bold">Du</span>
                        )}
                      </span>
                      <span className="col-span-2 text-center text-ral-charcoal-light">{p.rounds_played}</span>
                      <span className="col-span-2 text-center text-emerald-700 font-bold">{p.wins}</span>
                      <span className="col-span-2 text-center font-mono text-xs text-ral1001-dark font-bold">{winRate}%</span>
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
