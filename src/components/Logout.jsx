import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Logout({ onLogout }) {
    const navigate = useNavigate();

    useEffect(() => {
        localStorage.removeItem('mindflow_auth');
        if (onLogout) onLogout();
        navigate('/', { replace: true });
    }, [navigate, onLogout]);

    return null;
}