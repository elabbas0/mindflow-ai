import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUser, getAllItems, updateUser, updateItem } from './services/api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
    const [user, setUser] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAll = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        if (!isBackground) setError(null);
        try {
            const email = localStorage.getItem('mindflow_user_email') || '';
            if (!email) {
                if (!isBackground) setLoading(false);
                return;
            }
            let [userData, itemsData] = await Promise.all([
                getUser(email),
                getAllItems(email),
            ]);
            
            try {
                const localUserUpdates = JSON.parse(localStorage.getItem('mindflow_user_updates')) || {};
                if (userData) {
                    userData = { ...userData, ...localUserUpdates };
                }
                
                const localItemUpdates = JSON.parse(localStorage.getItem('mindflow_item_updates')) || {};
                let mergedItems = Array.isArray(itemsData) ? itemsData : [];
                mergedItems = mergedItems.map(i => localItemUpdates[i.id] ? { ...i, ...localItemUpdates[i.id] } : i);
                itemsData = mergedItems;
            } catch (e) {
                console.error('Error merging local state', e);
            }

            setUser(userData);
            setItems(Array.isArray(itemsData) ? itemsData : []);
        } catch (err) {
            console.error('UserContext fetch error:', err);
            if (!isBackground) setError('Failed to load data from server.');
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(() => {
            fetchAll(true);
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const handleUpdateUser = async (data) => {
        const email = localStorage.getItem('mindflow_user_email') || '';

        setUser(prev => ({ ...prev, ...data }));
        try {
            const local = JSON.parse(localStorage.getItem('mindflow_user_updates')) || {};
            localStorage.setItem('mindflow_user_updates', JSON.stringify({ ...local, ...data }));
        } catch (e) {
            console.error('Error saving user update to local', e);
        }

        // Profile updates go through POST /api/users (there is no PUT /api/users).
        try {
            await updateUser({
                telegramId: user?.telegramId,
                gmail: data.gmail || email || undefined,
                ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
                ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
            });
        } catch (err) {
            console.error('Failed to sync user to backend', err);
        }
        await fetchAll(true);
    };

    const handleUpdateItem = async (itemId, data) => {
        const email = localStorage.getItem('mindflow_user_email') || '';
        
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...data } : i));
        try {
            const local = JSON.parse(localStorage.getItem('mindflow_item_updates')) || {};
            local[itemId] = { ...(local[itemId] || {}), ...data };
            localStorage.setItem('mindflow_item_updates', JSON.stringify(local));
        } catch (e) {
            console.error('Error saving item update to local', e);
        }

        if (email) {
            try {
                await updateItem(email, itemId, data);
            } catch (err) {
                console.error('Failed to sync item to backend', err);
            }
            await fetchAll(true);
        }
    };

    return (
        <UserContext.Provider value={{ user, items, loading, error, refetch: fetchAll, updateUser: handleUpdateUser, updateItem: handleUpdateItem }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    return useContext(UserContext);
}
