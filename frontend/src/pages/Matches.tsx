import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { matchesApi, predictionsApi, groupsApi } from '../api';
import { Match, Prediction, Group } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PredictionModal from '../components/PredictionModal';

function getPointsBadge(points?: number) {
  if (points === undefined || points === null) return null;
  if (points === 3) return <span className="points-exact">3 pts ✓</span>;
  if (points === 2) return <span className="points-draw">2 pts ≈</span>;
  if (points === 1) return <span className="points-winner">1 pt →</span>;
  return <span className="points-miss">0 pts ✗</span>;
}

function MatchCard({
  match,
  prediction,
  onPalpite,
}: {
  match: Match;
  prediction?: Prediction;
  onPalpite: () => void;
}) {
  const isPast = new Date(match.match_date) <= new Date();
  const canPredict = match.status === 'scheduled' && !isPast;

  return (
    <div className="card hover:border-gray-700 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {match.group_name && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              Grupo {match.group_name}
            </span>
          )}
          <span className="text-xs text-gray-500">{match.stage}</span>
        </div>
        <span className={match.status === 'live' ? 'badge-live' : match.status === 'finished' ? 'badge-finished' : 'badge-scheduled'}>
          {match.status === 'live' ? '🔴 Ao Vivo' : match.status === 'finished' ? 'Encerrado' : 'Agendado'}
        </span>
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex-1 text-center">
          <div className="text-3xl mb-1">{match.home_team_flag}</div>
          <div className="font-bold text-white text-sm leading-tight">{match.home_team}</div>
        </div>

        <div className="text-center px-3">
          {match.status === 'finished' ? (
            <div className="text-2xl font-black text-white">
              {match.home_score} <span className="text-gray-500">×</span> {match.away_score}
            </div>
          ) : (
            <div className="text-gray-400 font-bold text-sm">vs</div>
          )}
          <div className="text-gray-500 text-xs mt-1">
            {new Date(match.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            {' '}
            {new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="flex-1 text-center">
          <div className="text-3xl mb-1">{match.away_team_flag}</div>
          <div className="font-bold text-white text-sm leading-tight">{match.away_team}</div>
        </div>
      </div>

      {/* Venue */}
      <div className="text-xs text-gray-500 text-center mb-3">
        📍 {match.venue}, {match.city}
      </div>

      {/* Prediction */}
      <div className="border-t border-gray-800 pt-3">
        {prediction ? (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-400">Seu palpite: </span>
              <span className="font-bold text-white">
                {prediction.home_score} × {prediction.away_score}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {getPointsBadge(prediction.points)}
              {canPredict && (
                <button onClick={onPalpite} className="text-xs text-copa-green hover:text-green-400 font-medium">
                  Editar
                </button>
              )}
            </div>
          </div>
        ) : canPredict ? (
          <button
            onClick={onPalpite}
            className="w-full btn-primary text-sm py-2"
          >
            Fazer Palpite
          </button>
        ) : (
          <div className="text-center text-gray-600 text-xs">
            {isPast && match.status === 'scheduled' ? 'Prazo encerrado' : 'Sem palpite'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Matches() {
  const { id: groupId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<string>('Fase de Grupos');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const stages = ['Fase de Grupos', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Terceiro Lugar', 'Final'];

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      matchesApi.getAll(),
      predictionsApi.getMine(groupId),
      groupsApi.getById(groupId),
    ]).then(([mRes, pRes, gRes]) => {
      setMatches(mRes.data);
      setPredictions(pRes.data);
      setGroup(gRes.data);
    }).finally(() => setLoading(false));
  }, [groupId]);

  const filteredMatches = matches.filter(m => m.stage === activeStage);
  const getPrediction = (matchId: string) =>
    predictions.find(p => p.match_id === matchId);

  // Group matches by group_name if in group stage
  const groupedByMatchGroup = activeStage === 'Fase de Grupos'
    ? filteredMatches.reduce<Record<string, Match[]>>((acc, m) => {
        const key = m.group_name || 'Outros';
        if (!acc[key]) acc[key] = [];
        acc[key].push(m);
        return acc;
      }, {})
    : null;

  const totalPredicted = predictions.filter(p =>
    matches.find(m => m.id === p.match_id && m.stage === activeStage)
  ).length;

  if (loading) return (
    <div className="flex justify-center py-14">
      <div className="w-8 h-8 border-4 border-copa-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link to="/groups" className="hover:text-white">Bolões</Link>
            <span>/</span>
            <Link to={`/groups/${groupId}`} className="hover:text-white">{group?.name}</Link>
            <span>/</span>
            <span className="text-white">Palpites</span>
          </div>
          <h1 className="text-2xl font-black text-white">Palpites</h1>
        </div>
        <Link to={`/groups/${groupId}/ranking`} className="btn-secondary text-sm self-start sm:self-auto">
          🏅 Ver Ranking
        </Link>
      </div>

      {/* Stage tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {stages.map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeStage === stage
                ? 'bg-copa-green text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {stage}
          </button>
        ))}
      </div>

      {/* Progress */}
      {filteredMatches.length > 0 && (
        <div className="text-sm text-gray-400">
          {totalPredicted} de {filteredMatches.length} palpites feitos
          <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-copa-green rounded-full transition-all"
              style={{ width: `${(totalPredicted / filteredMatches.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Matches */}
      {groupedByMatchGroup ? (
        Object.entries(groupedByMatchGroup)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([groupName, groupMatches]) => (
            <div key={groupName}>
              <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-copa-yellow rounded-full inline-block" />
                Grupo {groupName}
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {groupMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    prediction={getPrediction(match.id)}
                    onPalpite={() => setSelectedMatch(match)}
                  />
                ))}
              </div>
            </div>
          ))
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filteredMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              prediction={getPrediction(match.id)}
              onPalpite={() => setSelectedMatch(match)}
            />
          ))}
        </div>
      )}

      {filteredMatches.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          Nenhuma partida encontrada para esta fase.
        </div>
      )}

      {/* Modal */}
      {selectedMatch && groupId && (
        <PredictionModal
          match={selectedMatch}
          groupId={groupId}
          existing={getPrediction(selectedMatch.id)}
          onClose={() => setSelectedMatch(null)}
          onSaved={(saved) => {
            setPredictions(prev => {
              const idx = prev.findIndex(p => p.match_id === saved.match_id && p.group_id === saved.group_id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = saved;
                return updated;
              }
              return [...prev, saved];
            });
          }}
        />
      )}
    </div>
  );
}
