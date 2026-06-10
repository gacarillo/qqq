import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string; errors?: Array<{ msg: string }> }>;
      const msg = axiosErr.response?.data?.errors?.[0]?.msg || axiosErr.response?.data?.error;
      setError(msg || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚽</div>
          <h1 className="text-3xl font-black text-white mb-1">Bolão Copa 2026</h1>
          <p className="text-gray-400">Crie sua conta e entre na disputa!</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-white mb-6">Criar Conta</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
                placeholder="Seu nome"
                required minLength={2} maxLength={100}
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                required minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirmar senha</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input-field"
                placeholder="Repita a senha"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>

          <p className="text-center text-gray-400 text-sm mt-5">
            Já tem conta?{' '}
            <Link to="/login" className="text-copa-green hover:text-green-400 font-medium">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
