import React, { useState, useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

/**
 * Drop-in replacement for <Outlet /> inside MainLayout.
 * Gives a smooth Dissolve (pure opacity cross-fade, Linear, 300ms)
 * transition between pages, while the sidebar / layout chrome
 * around it stays completely static.
 *
 * Usage in Layout.jsx:
 *
 *   import PageTransition from './PageTransition';
 *   // ...
 *   <div className="flex-1 overflow-y-auto">
 *     <PageTransition />   // instead of <Outlet />
 *   </div>
 */

const DISSOLVE_MS = 300; // Figma spec: Dissolve / Linear / 300ms

export default function PageTransition() {
    const location = useLocation();
    const outlet = useOutlet();

    const [displayLocation, setDisplayLocation] = useState(location);
    const [displayOutlet, setDisplayOutlet] = useState(outlet);
    const [stage, setStage] = useState('fade-in'); // 'fade-in' | 'fade-out'

    useEffect(() => {
        if (location.pathname !== displayLocation.pathname) {
            setStage('fade-out');
        } else {
            // Same route, but element/content updated (e.g. re-render) — keep in sync
            setDisplayOutlet(outlet);
        }
    }, [location, displayLocation, outlet]);

    const handleAnimationEnd = () => {
        if (stage === 'fade-out') {
            setDisplayLocation(location);
            setDisplayOutlet(outlet);
            setStage('fade-in');
        }
    };

    return (
        <>
            <style>{`
                @keyframes dissolveOut {
                    0%   { opacity: 1; }
                    100% { opacity: 0; }
                }
                @keyframes dissolveIn {
                    0%   { opacity: 0; }
                    100% { opacity: 1; }
                }
                .dissolve-fade-out {
                    animation: dissolveOut ${DISSOLVE_MS}ms linear both;
                }
                .dissolve-fade-in {
                    animation: dissolveIn ${DISSOLVE_MS}ms linear both;
                }
            `}</style>
            <div className={`dissolve-${stage}`} onAnimationEnd={handleAnimationEnd}>
                {displayOutlet}
            </div>
        </>
    );
}