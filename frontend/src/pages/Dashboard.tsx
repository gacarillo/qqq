import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { groupsApi } from '../api';
import { Group } from '../types';
import { AxiosError } from 'axios';

const COPA_START = new Date('2026-06-11T00:00:00-03:00');

function Countdown() {
  const [diff, setDiff] = useState(COPA_START.getTime() - Date.now());

  useEffect(() => {
    const timer = setInterval(() => setDiff(COPA_START.getTime() - Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (diff <= 0) return <span className="text-copa-green font-bold">A Copa está acontecendo! 🎉</span>;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  return (
    <div className="flex gap-3 justify-center">
      {[
        { v: days, l: 'Dias' },
        { v: hours, l: 'Horas' },
        { v: mins, l: 'Min' },
        { v: secs, l: 'Seg' },
      ].map(({ v, l }) => (
        <div key={l} className="bg-white/10 rounded-xl px-4 py-3 min-w-[64px] text-center">
          <div className="text-2xl font-black text-copa-yellow tabular-nums">
            {String(v).padStart(2, '0')}
          </div>
          <div className="text-xs text-white/60 mt-0.5">{l}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    groupsApi.getAll()
      .then(r => setGroups(r.data))
      .catch((e: AxiosError) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div className="bg-copa-gradient rounded-2xl p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 text-[200px] leading-none">⚽</div>
        </div>
        <div className="relative z-10">
          <div className="text-4xl mb-2">🏆</div>
          <h1 className="text-3xl font-black text-white mb-1">
            Olá, {user?.name.split(' ')[0]}!
          </h1>
          <p className="text-white/70 mb-6">Copa do Mundo 2026 — EUA • Canadá • México</p>
          <Countdown />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-black text-copa-green">{groups.length}</div>
          <div className="text-gray-400 text-sm mt-1">Bolões</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-copa-yellow">96</div>
          <div className="text-gray-400 text-sm mt-1">Jogos</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-blue-400">48</div>
          <div className="text-gray-400 text-sm mt-1">Seleções</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-purple-400">12</div>
          <div className="text-gray-400 text-sm mt-1">Grupos</div>
        </div>
      </div>

      {/* My groups */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Meus Bolões</h2>
          <Link to="/groups" className="text-copa-green text-sm hover:text-green-400 font-medium">
            Ver todos →
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-copa-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="card text-center py-10">
            <div className="text-5xl mb-3">🎯</div>
            <h3 className="text-lg font-bold text-white mb-2">Nenhum bolão ainda</h3>
            <p className="text-gray-400 text-sm mb-4">
              Crie ou entre em um bolão para começar a apostar!
            </p>
            <Link to="/groups" className="btn-primary inline-flex">
              Criar ou Entrar em Bolão
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {groups.slice(0, 4).map(group => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="card hover:border-copa-green/50 hover:bg-gray-800 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white group-hover:text-copa-green transition-colors">
                      {group.name}
                    </h3>
                    {group.description && (
                      <p className="text-gray-400 text-sm mt-0.5 line-clamp-1">{group.description}</p>
                    )}
                  </div>
                  <span className="bg-copa-blue/30 text-copa-yellow font-mono text-xs font-bold px-2 py-1 rounded border border-copa-blue/50">
                    {group.code}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    👥 {group.member_count} participante{group.member_count !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    👑 {group.owner_name}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="text-xs text-copa-green font-medium">Ver palpites →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Scoring rules */}
      <div className="card border-copa-yellow/20 bg-copa-blue/10">
        <h3 className="text-copa-yellow font-bold mb-3 flex items-center gap-2">
          <span>📋</span> Regras de Pontuação
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { pts: '3', label: 'Placar exato', color: 'text-copa-green', bg: 'bg-copa-green/10 border-copa-green/20' },
            { pts: '2', label: 'Empate correto', color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/20' },
            { pts: '1', label: 'Vencedor certo', color: 'text-copa-yellow', bg: 'bg-copa-yellow/10 border-copa-yellow/20' },
            { pts: '0', label: 'Errou tudo', color: 'text-gray-500', bg: 'bg-gray-800/50 border-gray-700/50' },
          ].map(({ pts, label, color, bg }) => (
            <div key={pts} className={`rounded-lg border p-3 text-center ${bg}`}>
              <div className={`text-2xl font-black ${color}`}>{pts}</div>
              <div className="text-gray-400 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
