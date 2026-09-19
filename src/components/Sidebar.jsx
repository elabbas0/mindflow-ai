import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MindFlowLogo from "../images/Logo.png";
import { useUser } from '../UserContext';
import {
    LayoutDashboard,
    Calendar,
    LogOut,
    Menu,
    X,
    Edit2,
    Check
} from 'lucide-react';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user: apiUser, updateUser } = useUser() || {};
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editFirstName, setEditFirstName] = useState('');
    const [editLastName, setEditLastName] = useState('');
    const [editEmail, setEditEmail] = useState('');

    const sidebarItems = [
        { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
        { label: 'Calendar', path: '/calendar', icon: <Calendar size={20} /> },
    ];

    const firstName = apiUser?.firstName || '';
    const lastName = apiUser?.lastName || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || 'User');
    const email = apiUser?.gmail || localStorage.getItem('mindflow_user_email') || '';
    const initials = (firstName[0] || '') + (lastName[0] || '') || 'U';

    const user = { name: fullName, email, initials };

    const handleLogout = () => {
        navigate('/logout');
    };

    const handleItemClick = (path) => {
        navigate(path);
        setMobileOpen(false);
    };

    const handleEditClick = () => {
        setEditFirstName(apiUser?.firstName || '');
        setEditLastName(apiUser?.lastName || '');
        setEditEmail(apiUser?.gmail || localStorage.getItem('mindflow_user_email') || '');
        setIsEditingProfile(true);
    };

    const handleSaveClick = async () => {
        if (updateUser) {
            await updateUser({ firstName: editFirstName, lastName: editLastName, gmail: editEmail });
            // Additionally update the fallback local email if it's the primary tracker,
            // though UserContext handles full persistence already.
            if (editEmail) {
                localStorage.setItem('mindflow_user_email', editEmail);
            }
        }
        setIsEditingProfile(false);
    };

    return (
        <>
            {/* Mobil Header və Açma/Bağlama Düyməsi */}
            <div className="md:hidden flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3 pt-safe sticky top-0 z-50 w-full">
                <div
                    onClick={() => navigate('/dashboard')}
                    className="w-20 h-1 cursor-pointer flex items-center overflow-hidden"
                >
                    <img src={MindFlowLogo} alt="MindFlow AI" className="w-full h-full object-cover" />
                </div>
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition"
                    aria-label="Toggle Menu"
                >
                    {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Mobil üçün Overlay fon */}
            {mobileOpen && (
                <div
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 bg-black/20 z-40 md:hidden backdrop-blur-xs"
                />
            )}

            {/* Sidebar Konteyneri (Mobil üçün Drawer, Kompüter üçün Sticky Sidebar) */}
            <aside
                className={`w-64 bg-white border-r border-gray-100 flex flex-col justify-between p-6 flex-shrink-0 h-screen fixed md:sticky top-0 z-50 transition-transform duration-300 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                    }`}
            >
                <div>
                    {/* Logo hissəsi (Kompüter üçün) */}
                    <div
                        onClick={() => navigate('/dashboard')}
                        className="hidden md:flex items-center gap-3 mb-10 cursor-pointer group"
                    >
                        <div className="w-45 h-12  rounded-xl flex items-center justify-center flex-shrink-0 transition group-hover:scale-105 overflow-hidden">
                            <img src={MindFlowLogo} alt="MindFlow AI" className="w-full h-full object-cover" />
                        </div>
                    </div>

                    {/* Naviqasiya menyusu */}
                    <nav className="space-y-1">
                        {sidebarItems.map((item) => {
                            const isDashboardActive = item.path === '/dashboard' && (
                                location.pathname === '/dashboard' ||
                                location.pathname.startsWith('/notes') ||
                                location.pathname.startsWith('/projects') ||
                                location.pathname.startsWith('/meetings') ||
                                location.pathname.startsWith('/todo') ||
                                location.pathname.startsWith('/health')
                            );

                            const isActive = isDashboardActive || location.pathname === item.path;

                            return (
                                <button
                                    key={item.path}
                                    onClick={() => handleItemClick(item.path)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-medium transition text-left ${isActive
                                        ? 'bg-[#EBFBF0] text-[#00C875]'
                                        : 'text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    <span className={isActive ? 'text-[#00C875]' : 'text-gray-400'}>
                                        {item.icon}
                                    </span>
                                    <span className="text-sm">{item.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Profil və Log out hissəsi */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 px-2">
                        <div className="w-10 h-10 rounded-full bg-[#EBFBF0] text-[#00C875] flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {user.initials}
                        </div>
                        <div className="overflow-hidden flex-1">
                            {isEditingProfile ? (
                                <div className="flex flex-col gap-1">
                                    <input 
                                        type="text" 
                                        value={editFirstName} 
                                        onChange={(e) => setEditFirstName(e.target.value)} 
                                        className="text-sm font-bold text-gray-900 w-full border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-[#00C875] transition-colors"
                                        placeholder="First Name"
                                    />
                                    <input 
                                        type="text" 
                                        value={editLastName} 
                                        onChange={(e) => setEditLastName(e.target.value)} 
                                        className="text-xs text-gray-700 w-full border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-[#00C875] transition-colors"
                                        placeholder="Last Name"
                                    />
                                    <input 
                                        type="email" 
                                        value={editEmail} 
                                        onChange={(e) => setEditEmail(e.target.value)} 
                                        className="text-xs text-gray-500 w-full border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-[#00C875] transition-colors"
                                        placeholder="Email Address"
                                    />
                                </div>
                            ) : (
                                <>
                                    <h4 className="text-sm font-bold text-gray-900 truncate">{user.name}</h4>
                                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                                </>
                            )}
                        </div>
                        <button
                            onClick={isEditingProfile ? handleSaveClick : handleEditClick}
                            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isEditingProfile ? 'text-[#00C875] bg-[#EBFBF0]' : 'text-gray-400 hover:text-[#00C875] hover:bg-gray-50'}`}
                            title={isEditingProfile ? "Save Profile" : "Edit Profile"}
                        >
                            {isEditingProfile ? <Check size={16} /> : <Edit2 size={16} />}
                        </button>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-red-600 bg-red-50 hover:bg-red-100 transition text-left"
                    >
                        <LogOut size={20} />
                        <span className="text-sm">Log out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}