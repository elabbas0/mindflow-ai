import React, { useState, useEffect } from 'react';
import logoIcon from './images/framelogo.png';

const TEXT = 'MindFlow';
const START_DELAY_MS = 350;
const LETTER_STEP_MS = 90;
const LETTER_DURATION_MS = 220;

const MIN_DISPLAY_MS = START_DELAY_MS + TEXT.length * LETTER_STEP_MS + 700;
const FADE_OUT_MS = 350;

export default function LoadingScreen({ onFinish }) {
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const showTimer = setTimeout(() => setExiting(true), MIN_DISPLAY_MS);
        return () => clearTimeout(showTimer);
    }, []);

    const handleTransitionEnd = () => {
        if (exiting) onFinish && onFinish();
    };

    return (
        <div
            className={`fixed inset-0 z-[9999] bg-white flex items-center justify-center loading-screen ${exiting ? 'loading-screen-exit' : ''}`}
            onTransitionEnd={handleTransitionEnd}
        >
            <style>{`
                .loading-screen {
                    opacity: 1;
                    transition: opacity ${FADE_OUT_MS}ms ease;
                }
                .loading-screen-exit {
                    opacity: 0;
                    pointer-events: none;
                }

                @keyframes spinLogo {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                .loading-icon {
                    animation: spinLogo 1.6s linear infinite;
                }

                @keyframes letterIn {
                    0%   { opacity: 0; transform: translateY(6px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .loading-letter {
                    display: inline-block;
                    opacity: 0;
                    animation: letterIn ${LETTER_DURATION_MS}ms ease forwards;
                }
            `}</style>

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 -translate-y-10 px-4 text-center sm:text-left">
                <img src={logoIcon} alt="" className="w-16 h-16 sm:w-20 sm:h-20 loading-icon" />
                <span className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight">
                    {TEXT.split('').map((char, i) => (
                        <span
                            key={i}
                            className="loading-letter"
                            style={{ animationDelay: `${START_DELAY_MS + i * LETTER_STEP_MS}ms` }}
                        >
                            {char}
                        </span>
                    ))}
                </span>
            </div>
        </div>
    );
}