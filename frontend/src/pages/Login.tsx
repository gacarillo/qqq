import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg = (err as AxiosError<{ error: string }>).response?.data?.error;
      setError(msg || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🏆</div>
          <h1 className="text-3xl font-black text-white mb-1">Bolão Copa 2026</h1>
          <p className="text-gray-400">Faça seu login para entrar no jogo</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-white mb-6">Entrar</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-gray-400 text-sm mt-5">
            Não tem conta?{' '}
            <Link to="/register" className="text-copa-green hover:text-green-400 font-medium">
              Criar conta
            </Link>
          </p>
        </div>

        <div className="mt-6 card bg-copa-blue/20 border-copa-blue/30">
          <h3 className="text-copa-yellow font-bold text-sm mb-2">Como funciona a pontuação?</h3>
          <div className="space-y-1.5 text-sm text-gray-300">
            <div className="flex items-center gap-2">
              <span className="points-exact">3 pts</span>
              <span>Placar exato</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="points-draw">2 pts</span>
              <span>Empate correto (placar diferente)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="points-winner">1 pt</span>
              <span>Vencedor correto</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="points-miss">0 pts</span>
              <span>Errou o resultado</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
