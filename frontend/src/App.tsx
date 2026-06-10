import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import GroupDetails from './pages/GroupDetails';
import Matches from './pages/Matches';
import Ranking from './pages/Ranking';
import Navbar from './components/Navbar';
import { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-10 h-10 border-4 border-copa-green border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <AppLayout><Dashboard /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/groups" element={
            <ProtectedRoute>
              <AppLayout><Groups /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/groups/:id" element={
            <ProtectedRoute>
              <AppLayout><GroupDetails /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/groups/:id/matches" element={
            <ProtectedRoute>
              <AppLayout><Matches /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/groups/:id/ranking" element={
            <ProtectedRoute>
              <AppLayout><Ranking /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
