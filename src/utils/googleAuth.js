import axios from 'axios';

export function isIosDevice() {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// iOS Safari (especially installed PWAs) can't do auth popups: the popup
// escapes into a full Safari tab and never returns. There we use the
// redirect flow instead — Google sends the user back to our origin with
// #access_token=... which we pick up on launch.
export function getRedirectAccessToken() {
    if (typeof window === 'undefined') return null;
    const match = window.location.hash.match(/[#&]access_token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export function clearUrlHash() {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
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
