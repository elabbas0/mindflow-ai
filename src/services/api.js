import axios from 'axios';

// Deployed backend API (Railway). Override per environment with VITE_API_URL
// (e.g. in Vercel project settings). The app never talks to localhost:
// everything is synced through this API.
const BASE =
    import.meta.env.VITE_API_URL || 'https://backend-production-4d2a.up.railway.app';

// Fetch user profile by gmail
export async function getUser(email) {
    const res = await axios.get(`${BASE}/api/users`, { params: { gmail: email } });
    return res.data?.user || null;
}

// Fetch all items (todos, projects, meetings, notes, health) by gmail
export async function getAllItems(email) {
    const res = await axios.get(`${BASE}/api/items`, { params: { gmail: email } });
    const raw = res.data?.items;
    return Array.isArray(raw) ? raw : [];
}

// Fetch categories with required fields and ask order
export async function getCategories() {
    const res = await axios.get(`${BASE}/api/categories`);
    const raw = res.data?.categories;
    return Array.isArray(raw) ? raw : [];
}

// Update user profile by gmail.
// The backend has no PUT /api/users: profile updates go through
// POST /api/users, which requires telegramId.
export async function updateUser({ telegramId, gmail, firstName, lastName }) {
    const res = await axios.post(`${BASE}/api/users`, {
        ...(telegramId !== undefined ? { telegramId } : {}),
        ...(gmail ? { gmail } : {}),
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
    });
    return res.data;
}

// Replace a saved item by id (full fields). Identity goes in the body:
// the backend scopes strictly by body telegramId/gmail (owner only).
export async function updateItem(email, itemId, data) {
    const res = await axios.put(`${BASE}/api/items/${itemId}`, { gmail: email, ...data });
    return res.data;
}

// Partially edit a saved item by id (owner only). Preferred for edits
// where only some fields change (e.g. health records).
export async function patchItem(email, itemId, data) {
    const res = await axios.patch(`${BASE}/api/items/${itemId}`, { gmail: email, ...data });
    return res.data;
}

// Ask the AI assistant over the user's saved items.
export async function askAssistant({ telegramId, gmail, question }) {
    const res = await axios.post(`${BASE}/api/assistant/ask`, {
        ...(telegramId ? { telegramId: Number(telegramId) } : {}),
        ...(gmail ? { gmail } : {}),
        question,
    });
    return res.data;
}

// Attach a file reference to a health record (owner only, max 10).
export async function attachFile(email, itemId, { file_id, file_name, mime_type }) {
    const res = await axios.post(`${BASE}/api/items/${itemId}/files`, {
        gmail: email,
        file_id,
        ...(file_name ? { file_name } : {}),
        ...(mime_type ? { mime_type } : {}),
    });
    return res.data;
}

// Remove a file reference from a health record (owner only, by file_id or index).
export async function removeFile(email, itemId, { file_id, index }) {
    const res = await axios.delete(`${BASE}/api/items/${itemId}/files`, {
        data: { gmail: email, ...(file_id ? { file_id } : {}), ...(index !== undefined ? { index } : {}) },
    });
    return res.data;
}

// Health file refs are stored as a JSON-encoded array string in
// item.fields.files: '[{"file_id":"...","file_name":"..."}]'.
export function parseFiles(raw) {
    if (!raw) return [];
    const t = String(raw).trim();
    if (!t) return [];
    try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((e) => e && (typeof e === 'string' || typeof e.file_id === 'string'))
                .map((e) => (typeof e === 'string' ? { file_id: e } : e));
        }
    } catch {
        // Fall through to legacy comma-separated handling.
    }
    return t
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((file_id) => ({ file_id }));
}
