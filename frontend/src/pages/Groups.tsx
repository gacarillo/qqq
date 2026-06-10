import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { groupsApi } from '../api';
import { Group } from '../types';
import { AxiosError } from 'axios';

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Create form
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join form
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  const fetchGroups = () => {
    setLoading(true);
    groupsApi.getAll()
      .then(r => setGroups(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchGroups, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    try {
      const res = await groupsApi.create({ name: createName, description: createDesc || undefined });
      setGroups(prev => [res.data, ...prev]);
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
    } catch (err) {
      const msg = (err as AxiosError<{ error: string }>).response?.data?.error;
      setCreateError(msg || 'Erro ao criar bolão');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError('');
    setJoinLoading(true);
    try {
      const res = await groupsApi.join(joinCode.toUpperCase());
      setGroups(prev => [res.data, ...prev]);
      setShowJoin(false);
      setJoinCode('');
    } catch (err) {
      const msg = (err as AxiosError<{ error: string }>).response?.data?.error;
      setJoinError(msg || 'Erro ao entrar no bolão');
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Meus Bolões</h1>
          <p className="text-gray-400 text-sm mt-0.5">{groups.length} bolão{groups.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowJoin(true); setShowCreate(false); }} className="btn-outline text-sm">
            Entrar com Código
          </button>
          <button onClick={() => { setShowCreate(true); setShowJoin(false); }} className="btn-primary text-sm">
            + Criar Bolão
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card border-copa-green/30">
          <h3 className="font-bold text-white mb-4">Criar novo bolão</h3>
          {createError && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              className="input-field"
              placeholder="Nome do bolão *"
              required minLength={2} maxLength={100}
            />
            <input
              type="text"
              value={createDesc}
              onChange={e => setCreateDesc(e.target.value)}
              className="input-field"
              placeholder="Descrição (opcional)"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button type="submit" disabled={createLoading} className="btn-primary text-sm">
                {createLoading ? 'Criando...' : 'Criar Bolão'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-outline text-sm">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="card border-copa-blue/30">
          <h3 className="font-bold text-white mb-4">Entrar em um bolão</h3>
          {joinError && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm">
              {joinError}
            </div>
          )}
          <form onSubmit={handleJoin} className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              className="input-field font-mono text-lg tracking-widest"
              placeholder="Código (ex: ABC123)"
              required minLength={6} maxLength={6}
            />
            <div className="flex gap-2">
              <button type="submit" disabled={joinLoading} className="btn-secondary text-sm">
                {joinLoading ? 'Entrando...' : 'Entrar no Bolão'}
              </button>
              <button type="button" onClick={() => setShowJoin(false)} className="btn-outline text-sm">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Groups list */}
      {loading ? (
        <div className="flex justify-center py-14">
          <div className="w-8 h-8 border-4 border-copa-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card text-center py-14">
          <div className="text-5xl mb-3">🎯</div>
          <h3 className="text-lg font-bold text-white mb-2">Sem bolões ainda</h3>
          <p className="text-gray-400 text-sm">Crie um bolão ou entre com o código de um amigo.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {groups.map(group => (
            <div key={group.id} className="card hover:border-gray-700 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white truncate">{group.name}</h3>
                  {group.description && (
                    <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">{group.description}</p>
                  )}
                </div>
                <div className="ml-3 flex-shrink-0">
                  <span className="bg-copa-blue/30 text-copa-yellow font-mono text-xs font-bold px-2.5 py-1.5 rounded border border-copa-blue/50">
                    {group.code}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                <span>👥 {group.member_count} participante{group.member_count !== 1 ? 's' : ''}</span>
                <span>👑 {group.owner_name}</span>
              </div>

              <div className="flex gap-2">
                <Link to={`/groups/${group.id}/matches`} className="btn-primary text-xs py-1.5 px-3 flex-1 text-center">
                  ⚽ Palpites
                </Link>
                <Link to={`/groups/${group.id}/ranking`} className="btn-secondary text-xs py-1.5 px-3 flex-1 text-center">
                  🏅 Ranking
                </Link>
                <Link to={`/groups/${group.id}`} className="btn-outline text-xs py-1.5 px-3">
                  Detalhes
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
