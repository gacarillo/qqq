import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rankingApi, groupsApi } from '../api';
import { RankingEntry, Group } from '../types';
import { useAuth } from '../contexts/AuthContext';

function getMedalEmoji(position: number) {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return null;
}

export default function Ranking() {
  const { id: groupId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      rankingApi.get(groupId),
      groupsApi.getById(groupId),
    ]).then(([rRes, gRes]) => {
      setRanking(rRes.data);
      setGroup(gRes.data);
    }).finally(() => setLoading(false));
  }, [groupId]);

  const myEntry = ranking.find(e => e.user_id === user?.id);

  if (loading) return (
    <div className="flex justify-center py-14">
      <div className="w-8 h-8 border-4 border-copa-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb & header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link to="/groups" className="hover:text-white">Bolões</Link>
          <span>/</span>
          <Link to={`/groups/${groupId}`} className="hover:text-white">{group?.name}</Link>
          <span>/</span>
          <span className="text-white">Ranking</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-white">🏅 Ranking</h1>
          <Link to={`/groups/${groupId}/matches`} className="btn-primary text-sm">
            ⚽ Palpites
          </Link>
        </div>
      </div>

      {/* My position highlight */}
      {myEntry && (
        <div className="bg-copa-gradient rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-black text-copa-yellow">
                #{myEntry.position}
              </div>
              <div>
                <div className="font-bold text-white">Sua posição</div>
                <div className="text-white/70 text-sm">{myEntry.total_predictions} palpites feitos</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-copa-yellow">{myEntry.total_points}</div>
              <div className="text-white/70 text-sm">pontos</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-center">
            <div className="bg-white/10 rounded-lg py-2">
              <div className="font-black text-white">{myEntry.exact_scores}</div>
              <div className="text-white/60 text-xs">Exatos (3pts)</div>
            </div>
            <div className="bg-white/10 rounded-lg py-2">
              <div className="font-black text-white">{myEntry.correct_draws}</div>
              <div className="text-white/60 text-xs">Empates (2pts)</div>
            </div>
            <div className="bg-white/10 rounded-lg py-2">
              <div className="font-black text-white">{myEntry.correct_winners}</div>
              <div className="text-white/60 text-xs">Vencedores (1pt)</div>
            </div>
          </div>
        </div>
      )}

      {/* Ranking table */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-bold text-white">Classificação Geral</h2>
        </div>

        {ranking.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            Nenhum palpite computado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {/* Column headers */}
            <div className="grid grid-cols-12 px-5 py-2 text-xs text-gray-500 font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Participante</div>
              <div className="col-span-2 text-center">Pts</div>
              <div className="col-span-1 text-center text-copa-green" title="Placar exato">✓</div>
              <div className="col-span-1 text-center text-blue-400" title="Empate correto">≈</div>
              <div className="col-span-1 text-center text-copa-yellow" title="Vencedor correto">→</div>
              <div className="col-span-2 text-center">Palp.</div>
            </div>

            {ranking.map((entry) => {
              const isMe = entry.user_id === user?.id;
              const medal = getMedalEmoji(entry.position);

              return (
                <div
                  key={entry.user_id}
                  className={`grid grid-cols-12 px-5 py-3 items-center transition-colors ${
                    isMe ? 'bg-copa-green/10 border-l-2 border-copa-green' : 'hover:bg-gray-800/50'
                  }`}
                >
                  <div className="col-span-1 font-bold text-gray-400">
                    {medal || `${entry.position}°`}
                  </div>
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      entry.position === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                      entry.position === 2 ? 'bg-gray-400/20 text-gray-300' :
                      entry.position === 3 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-copa-blue/30 text-copa-blue-light'
                    }`}>
                      {entry.user_name.charAt(0).toUpperCase()}
                    </div>
                    <span className={`font-medium truncate text-sm ${isMe ? 'text-copa-green' : 'text-white'}`}>
                      {entry.user_name} {isMe && '(você)'}
                    </span>
                  </div>
                  <div className="col-span-2 text-center font-black text-lg text-white">
                    {entry.total_points}
                  </div>
                  <div className="col-span-1 text-center text-copa-green font-bold text-sm">
                    {entry.exact_scores}
                  </div>
                  <div className="col-span-1 text-center text-blue-400 font-bold text-sm">
                    {entry.correct_draws}
                  </div>
                  <div className="col-span-1 text-center text-copa-yellow font-bold text-sm">
                    {entry.correct_winners}
                  </div>
                  <div className="col-span-2 text-center text-gray-400 text-sm">
                    {entry.scored_predictions}/{entry.total_predictions}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="text-copa-green font-bold">✓</span> Placar exato (3pts)</span>
        <span className="flex items-center gap-1"><span className="text-blue-400 font-bold">≈</span> Empate correto (2pts)</span>
        <span className="flex items-center gap-1"><span className="text-copa-yellow font-bold">→</span> Vencedor correto (1pt)</span>
        <span className="flex items-center gap-1">Palp. = Palpites com resultado / Total</span>
      </div>
    </div>
  );
}
