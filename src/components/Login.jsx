import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';

export default function LoginPage({ onLoginSuccess }) {
    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                const userInfo = await axios.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
                );
                const email = userInfo.data?.email || '';
                if (email) {
                    localStorage.setItem('mindflow_user_email', email);
                }
            } catch (e) {
                console.warn('Could not fetch Google userinfo:', e);
            }
            localStorage.setItem('mindflow_auth', 'true');
            if (onLoginSuccess) onLoginSuccess();
        },
        onError: () => console.log('Login Failed'),
    });

    return (
        <div className="min-h-screen bg-[#FAFAFB] flex flex-col items-center justify-center p-4 font-sans">
            <div className="flex items-center gap-2 mb-8">
                <div className="w-10 h-10 bg-[#00C875] rounded-xl flex items-center justify-center shadow-sm">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <span className="text-2xl font-bold text-gray-900 tracking-tight">MindFlow</span>
            </div>

            <div className="w-full max-w-[440px] bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-sm flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-6 shadow-inner">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>

                <h1 className="text-2xl sm:text-[26px] font-bold text-gray-900 tracking-tight mb-2">
                    MindFlow
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-[320px] mb-8">
                    Sign in to continue to your workspace, tasks, meetings, and calendar.
                </p>

                {/* Google Sign-In Button */}
                <button
                    onClick={() => login()}
                    className="w-full h-12 bg-[#16803C] hover:bg-[#126b32] text-white font-medium rounded-2xl flex items-center justify-center gap-3 transition shadow-sm active:scale-[0.99]"
                >
                    <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
                        <span className="text-[#16803C] font-bold text-sm">G</span>
                    </div>
                    <span className="text-sm font-semibold tracking-wide">Continue with Google</span>
                </button>

                <p className="text-[11px] text-gray-400 mt-6">
                    Your information stays organized privately with MindFlow.
                </p>

                <div className="w-full border-t border-gray-100 my-6"></div>

                <p className="text-[11px] text-gray-400 leading-normal">
                    By continuing, you agree to our{' '}
                    <a href="#terms" className="underline hover:text-gray-600 transition">Terms of Service</a>{' '}
                    and{' '}
                    <a href="#privacy" className="underline hover:text-gray-600 transition">Privacy Policy</a>.
                </p>
            </div>
        </div>
    );
}