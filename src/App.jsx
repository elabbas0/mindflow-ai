import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './Layout';
import Dashboard from './page/Dashboard';
import Calendar from './page/Calendar';
import TodoList from './components/TodoList';
import Projects from './components/Projects';
import Meetings from './components/Meetings';
import Notes from './components/Notes';
import Health from './components/Health';
import LoadingScreen from './Loadingscreen';
import LoginPage from './components/Login';
import Logout from './components/Logout';
import { UserProvider } from './UserContext';
import { exchangeGoogleCode } from './services/api';
import { clearAuthQuery, getAuthCodeReturn, persistLogin } from './utils/googleAuth';

export default function App() {
  const [showLoading, setShowLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('mindflow_auth') === 'true';
  });

  const handleLoginSuccess = () => {
    localStorage.setItem('mindflow_auth', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  // iOS auth-code redirect return: Google sent us back with
  // ?code=...&state=... — exchange it server-side, then sign in.
  // (Desktop popup flow never lands here.)
  useEffect(() => {
    const ret = getAuthCodeReturn();
    if (!ret) return;
    if (!ret.stateOk) {
      clearAuthQuery();
      return;
    }
    (async () => {
      try {
        const data = await exchangeGoogleCode({ code: ret.code, redirectUri: window.location.origin });
        if (data?.ok && data.profile?.email) {
          persistLogin(data.profile.email, data.profile.name || '');
          localStorage.setItem('mindflow_auth', 'true');
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.warn('Google redirect login failed:', e);
      } finally {
        clearAuthQuery();
      }
    })();
  }, []);

  if (showLoading) {
    return <LoadingScreen onFinish={() => setShowLoading(false)} />;
  }

  if (!isAuthenticated) {
    return (
      <Router>
        <Routes>
          <Route path="*" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <UserProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/logout" element={<Logout onLogout={handleLogout} />} />

          <Route element={<MainLayout />}>
          
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/todo" element={<TodoList />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/health" element={<Health />} />
          </Route>
        </Routes>
      </UserProvider>
    </Router>
  );
}