import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { groupsApi } from '../api';
import { Group } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';

export default function GroupDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    groupsApi.getById(id)
      .then(r => setGroup(r.data))
      .catch((e: AxiosError) => {
        if (e.response?.status === 403) navigate('/groups');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const copyCode = () => {
    if (!group) return;
    navigator.clipboard.writeText(group.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (!group || !id) return;
    if (!confirm('Tem certeza que deseja sair deste bolão?')) return;
    setLeaveLoading(true);
    try {
      await groupsApi.leave(id);
      navigate('/groups');
    } catch (e) {
      const msg = (e as AxiosError<{ error: string }>).response?.data?.error;
      setError(msg || 'Erro ao sair do bolão');
    } finally {
      setLeaveLoading(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-14">
      <div className="w-8 h-8 border-4 border-copa-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!group) return null;

  const isOwner = group.owner_id === user?.id;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to="/groups" className="hover:text-white">Bolões</Link>
        <span>/</span>
        <span className="text-white">{group.name}</span>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-black text-white">{group.name}</h1>
              {isOwner && (
                <span className="bg-copa-yellow/20 text-copa-yellow text-xs font-bold px-2 py-0.5 rounded border border-copa-yellow/30">
                  Criador
                </span>
              )}
            </div>
            {group.description && (
              <p className="text-gray-400">{group.description}</p>
            )}
            <p className="text-gray-500 text-sm mt-1">
              Criado em {new Date(group.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Código:</span>
              <span className="bg-copa-blue/30 text-copa-yellow font-mono font-black text-xl px-3 py-1.5 rounded border border-copa-blue/50">
                {group.code}
              </span>
              <button
                onClick={copyCode}
                className="text-gray-400 hover:text-white transition-colors p-1.5 rounded hover:bg-gray-700"
                title="Copiar código"
              >
                {copied ? '✅' : '📋'}
              </button>
            </div>
            <p className="text-gray-500 text-xs">Compartilhe para convidar amigos</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Link to={`/groups/${id}/matches`} className="btn-primary text-sm">
            ⚽ Fazer Palpites
          </Link>
          <Link to={`/groups/${id}/ranking`} className="btn-secondary text-sm">
            🏅 Ver Ranking
          </Link>
          {!isOwner && (
            <button
              onClick={handleLeave}
              disabled={leaveLoading}
              className="text-sm text-red-400 hover:text-red-300 border border-red-800/50 hover:border-red-600/50 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {leaveLoading ? 'Saindo...' : 'Sair do Bolão'}
            </button>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">
          Participantes ({group.members?.length || 0})
        </h2>
        <div className="space-y-2">
          {group.members?.map((member, i) => (
            <div key={member.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-copa-blue flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm">{member.name}</span>
                  {member.id === group.owner_id && (
                    <span className="text-copa-yellow text-xs">👑</span>
                  )}
                  {member.id === user?.id && (
                    <span className="text-copa-green text-xs font-medium">(você)</span>
                  )}
                </div>
                <p className="text-gray-500 text-xs truncate">{member.email}</p>
              </div>
              <span className="text-gray-600 text-xs">#{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
