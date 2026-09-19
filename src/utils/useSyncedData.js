import { useEffect, useState } from 'react';
import { getData, saveData } from '../utils/storage';

export function useSyncedData(keyName) {
    const [data, setData] = useState(() => getData(keyName));

    useEffect(() => {
        const handleUpdate = () => setData(getData(keyName));
        window.addEventListener('storage_updated', handleUpdate);
        window.addEventListener('storage', handleUpdate); 
        return () => {
            window.removeEventListener('storage_updated', handleUpdate);
            window.removeEventListener('storage', handleUpdate);
        };
    }, [keyName]);

    const updateData = (newData) => {
        saveData(keyName, newData);
        setData(newData);
    };

    return [data, updateData];
}