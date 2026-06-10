import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: '/dashboard', label: 'Início' },
    { to: '/groups', label: 'Meus Bolões' },
  ];

  return (
    <nav className="bg-copa-blue border-b border-copa-blue-light sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <span className="text-2xl">🏆</span>
            <div>
              <div className="text-copa-yellow font-black text-base leading-tight">BOLÃO</div>
              <div className="text-white/70 text-xs leading-tight font-medium">Copa 2026</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* User menu */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-copa-green flex items-center justify-center text-white font-bold text-sm">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-white/80">{user?.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-white/60 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Sair
            </button>
          </div>

          {/* Mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-white p-2"
          >
            <div className={`w-5 h-0.5 bg-current mb-1 transition-all ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
            <div className={`w-5 h-0.5 bg-current mb-1 transition-all ${menuOpen ? 'opacity-0' : ''}`} />
            <div className={`w-5 h-0.5 bg-current transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-copa-blue-light border-t border-white/10 px-4 py-3 space-y-1">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10"
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-white/10 pt-3 mt-2 flex items-center justify-between">
            <span className="text-sm text-white/60">{user?.name}</span>
            <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-300">
              Sair
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
