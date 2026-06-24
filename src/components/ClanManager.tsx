import React, { useState, useEffect } from 'react';
import { Clan, ClanPlayer } from '../types.ts';
import { Trophy, Users, UserPlus, Plus, Shield, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

interface ClanManagerProps {
  selectedClanId: number | null;
  onSelectClan: (clanId: number | null) => void;
}

export default function ClanManager({ selectedClanId, onSelectClan }: ClanManagerProps) {
  const [clans, setClans] = useState<Clan[]>([]);
  const [players, setPlayers] = useState<ClanPlayer[]>([]);
  const [newClanName, setNewClanName] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchClans();
  }, []);

  useEffect(() => {
    if (selectedClanId !== null) {
      fetchPlayers(selectedClanId);
    } else {
      setPlayers([]);
    }
  }, [selectedClanId]);

  const handleCreateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClanName.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/clans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClanName })
      });

      if (res.ok) {
        const data = await res.json();
        setClans(prev => [...prev, data]);
        onSelectClan(data.id);
        setNewClanName('');
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

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClanId || !newPlayerName.trim()) return;

    try {
      const res = await fetch(`/api/clans/${selectedClanId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlayerName })
      });

      if (res.ok) {
        setNewPlayerName('');
        fetchPlayers(selectedClanId);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Fehler beim Hinzufügen des Spielers.');
      }
    } catch (err) {
      console.error('Failed to add player:', err);
    }
  };

  return (
    <div id="clan-manager-container" className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-xl text-white">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-indigo-300">
          <Shield className="w-5 h-5 text-blue-400 animate-pulse" />
          Clan- und Bestenliste
        </h3>
        <button 
          onClick={fetchClans}
          className="text-slate-400 hover:text-indigo-300 transition-colors p-1.5 rounded-lg hover:bg-white/10"
          title="Clans aktualisieren"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-lg p-3 text-sm mb-4">
          {error}
        </div>
      )}

      {/* CLAN SELECTION & CREATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Clan Auswählen
          </label>
          <select
            value={selectedClanId || ''}
            onChange={(e) => onSelectClan(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full bg-[#0c0c24] border border-white/10 focus:border-indigo-400/50 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none transition-colors"
          >
            <option value="" className="bg-[#0c0c24]">-- Kein Clan (Nur lokales Spiel) --</option>
            {clans.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#0c0c24]">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Neuen Clan gründen
          </label>
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
        </div>
      </div>

      {/* LEADERS BOARD & PLAYER IN CLAN */}
      {selectedClanId !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-white/10 pt-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h4 className="text-md font-medium text-slate-200 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Clan-Rangliste ({players.length} Spieler)
            </h4>

            {/* Quick Add Player to Clan */}
            <form onSubmit={handleAddPlayer} className="flex gap-2 max-w-sm">
              <input
                type="text"
                placeholder="Spieler eintragen..."
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                className="w-full bg-[#0c0c24] border border-white/10 focus:border-indigo-400/50 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!newPlayerName.trim()}
                className="bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Hinzufügen
              </button>
            </form>
          </div>

          {players.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 border border-white/10 text-center">
              <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-300">Noch keine Spieler im Clan registriert.</p>
              <p className="text-xs text-slate-400 mt-1">Füge oben einen Spieler hinzu oder starte ein Spiel, um Runden aufzuzeichnen.</p>
            </div>
          ) : (
            <div className="bg-[#0c0c24]/55 rounded-xl border border-white/10 overflow-hidden">
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
                      <span className="col-span-5 font-medium text-slate-100 truncate">{p.name}</span>
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
