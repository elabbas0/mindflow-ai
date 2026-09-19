import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from "./components/Sidebar";
import InstallPrompt from "./components/InstallPrompt";
import PageTransition from "./PageTransition";
import ScrollToTop from "./ScrollToTop";
import { LayoutDashboard, Calendar, HeartPulse, FileText } from 'lucide-react';

const TABS = [
    { label: 'Home', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Calendar', path: '/calendar', icon: Calendar },
    { label: 'Health', path: '/health', icon: HeartPulse },
    { label: 'Notes', path: '/notes', icon: FileText },
];

function MobileBottomNav() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-gray-100 px-2 pt-1 pb-safe">
            <div className="grid grid-cols-4">
                {TABS.map((tab) => {
                    const active = tab.path === '/dashboard'
                        ? location.pathname === '/' ||
                          location.pathname === '/dashboard' ||
                          location.pathname.startsWith('/todo') ||
                          location.pathname.startsWith('/projects') ||
                          location.pathname.startsWith('/meetings')
                        : location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.path}
                            onClick={() => navigate(tab.path)}
                            className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition ${
                                active ? 'text-[#00C875]' : 'text-gray-400'
                            }`}
                            aria-label={tab.label}
                            aria-current={active ? 'page' : undefined}
                        >
                            <Icon size={22} />
                            <span className="text-[10px] font-semibold">{tab.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

export default function MainLayout() {
    return (
        <div className="flex flex-col md:flex-row h-screen bg-[#F8F9FC] font-sans text-gray-800 overflow-hidden">
            <Sidebar />
            <ScrollToTop />
            <main className="flex-1 overflow-y-auto w-full pb-20 md:pb-0">
                <PageTransition />
            </main>
            <MobileBottomNav />
            <InstallPrompt />
        </div>
    );
}
