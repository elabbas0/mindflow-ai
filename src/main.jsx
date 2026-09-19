import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId="138785074604-7qkr5os5lsug4pv54hoqtrkn0ogq7cof.apps.googleusercontent.com">
      <App />
    </GoogleOAuthProvider>
  </StrictMode>
);