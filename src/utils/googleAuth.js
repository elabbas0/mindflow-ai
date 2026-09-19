import axios from 'axios';

export function isIosDevice() {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// iOS Safari (especially installed PWAs) can't do auth popups: the popup
// escapes into a separate browser sheet with no shared session. There we use
// the auth-code + redirect flow instead — Google navigates back to our
// origin with ?code=...&state=... which we pick up on launch and exchange
// server-side via /api/auth/google.
export function getRedirectAccessToken() {
    if (typeof window === 'undefined') return null;
    const match = window.location.hash.match(/[#&]access_token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

const OAUTH_STATE_KEY = 'mindflow_oauth_state';

export function createOAuthState() {
    const state = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    try {
        sessionStorage.setItem(OAUTH_STATE_KEY, state);
    } catch {
        // ignore (private mode etc.)
    }
    return state;
}

export function getAuthCodeReturn() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code) return null;
    let expected = null;
    try {
        expected = sessionStorage.getItem(OAUTH_STATE_KEY);
    } catch {
        // private mode etc. — treat as mismatch below
    }
    return { code, stateOk: !!state && !!expected && state === expected };
}

export function clearUrlHash() {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function clearAuthQuery() {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(OAUTH_STATE_KEY);
    } catch {
        // ignore
    }
    window.history.replaceState(null, '', window.location.pathname);
}

export async function fetchGoogleProfile(accessToken) {
    const res = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data || {};
}

export function persistLogin(email, fullName) {
    if (email) localStorage.setItem('mindflow_user_email', email);
    if (fullName) localStorage.setItem('mindflow_user_name', fullName);
    localStorage.setItem('mindflow_auth', 'true');
}
