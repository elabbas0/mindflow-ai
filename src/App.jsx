import React, { useState, useEffect } from 'react';
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
import { clearUrlHash, fetchGoogleProfile, getRedirectAccessToken, persistLogin } from './utils/googleAuth';

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

  // iOS redirect-flow return: Google sent us back with #access_token=...
  // Complete the login here (desktop popup flow never lands here).
  useEffect(() => {
    const token = getRedirectAccessToken();
    if (!token) return;
    (async () => {
      try {
        const userInfo = await fetchGoogleProfile(token);
        persistLogin(userInfo?.email || '', userInfo?.name || '');
        localStorage.setItem('mindflow_auth', 'true');
        setIsAuthenticated(true);
      } catch (e) {
        console.warn('Google redirect login failed:', e);
      } finally {
        clearUrlHash();
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