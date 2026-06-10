import { useState } from 'react';
import { Match, Prediction } from '../types';
import { predictionsApi } from '../api';
import { AxiosError } from 'axios';

interface Props {
  match: Match;
  groupId: string;
  existing?: Prediction;
  onClose: () => void;
  onSaved: (prediction: Prediction) => void;
}

export default function PredictionModal({ match, groupId, existing, onClose, onSaved }: Props) {
  const [homeScore, setHomeScore] = useState(existing?.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(existing?.away_score ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await predictionsApi.upsert({
        match_id: match.id,
        group_id: groupId,
        home_score: homeScore,
        away_score: awayScore,
      });
      onSaved(res.data);
      onClose();
    } catch (err) {
      const msg = (err as AxiosError<{ error: string }>).response?.data?.error;
      setError(msg || 'Erro ao salvar palpite');
    } finally {
      setLoading(false);
    }
  };

  const ScoreInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg transition-colors"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
        className="w-16 h-10 bg-gray-800 border border-gray-600 text-white text-center text-xl font-black rounded-lg focus:outline-none focus:border-copa-green"
        min={0} max={30}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(30, value + 1))}
        className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg transition-colors"
      >
        +
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-white">Seu Palpite</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1">✕</button>
          </div>

          {/* Stage badge */}
          <div className="text-center mb-4">
            <span className="text-xs text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
              {match.stage}{match.group_name ? ` • Grupo ${match.group_name}` : ''}
            </span>
          </div>

          {/* Teams */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex-1 text-center">
              <div className="text-4xl mb-1">{match.home_team_flag}</div>
              <div className="font-bold text-white text-sm">{match.home_team}</div>
            </div>

            <div className="flex items-center gap-3">
              <ScoreInput value={homeScore} onChange={setHomeScore} />
              <span className="text-gray-500 font-bold text-xl">×</span>
              <ScoreInput value={awayScore} onChange={setAwayScore} />
            </div>

            <div className="flex-1 text-center">
              <div className="text-4xl mb-1">{match.away_team_flag}</div>
              <div className="font-bold text-white text-sm">{match.away_team}</div>
            </div>
          </div>

          {/* Result preview */}
          <div className="bg-gray-800 rounded-xl p-3 mb-4 text-center text-sm">
            <span className="text-gray-400">Seu palpite: </span>
            <span className="font-bold text-white">
              {match.home_team} {homeScore} × {awayScore} {match.away_team}
            </span>
            <div className="text-copa-yellow text-xs mt-1">
              {homeScore > awayScore ? `Vitória de ${match.home_team}` :
               awayScore > homeScore ? `Vitória de ${match.away_team}` : 'Empate'}
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Salvando...' : existing ? 'Atualizar Palpite' : 'Confirmar Palpite'}
            </button>
            <button onClick={onClose} className="btn-outline px-4">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
