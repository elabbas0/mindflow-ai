import { useEffect, useState } from 'react';
import { Download, Share, X, PlusSquare } from 'lucide-react';

function isIos() {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

const DISMISS_KEY = 'mindflow_pwa_dismissed';

// Android: uses the beforeinstallprompt event.
// iOS Safari: no install prompt API — show Share → Add to Home Screen steps.
export default function InstallPrompt() {
    const [deferred, setDeferred] = useState(null);
    const [showIosHelp, setShowIosHelp] = useState(false);
    // iOS Safari has no install-prompt event, so the guide banner is shown
    // on first render; Android waits for beforeinstallprompt below.
    const [visible, setVisible] = useState(() => {
        if (typeof window === 'undefined' || isStandalone()) return false;
        try {
            if (localStorage.getItem(DISMISS_KEY) === 'true') return false;
        } catch {
            return false;
        }
        return isIos();
    });

    useEffect(() => {
        if (isIos() || isStandalone()) return;
        const onPrompt = (e) => {
            e.preventDefault();
            try {
                if (localStorage.getItem(DISMISS_KEY) === 'true') return;
            } catch {
                return;
            }
            setDeferred(e);
            setVisible(true);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }, []);

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, 'true');
        } catch {
            // ignore
        }
        setVisible(false);
        setShowIosHelp(false);
    };

    const handleInstall = async () => {
        if (!deferred) {
            setShowIosHelp(true);
            return;
        }
        deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
        dismiss();
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-[60]">
            <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-xl flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#00C875] flex items-center justify-center flex-shrink-0">
                    <Download size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Install MindFlow</p>
                    {showIosHelp || isIos() ? (
                        <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                            Open the <Share size={12} className="inline" /> Share menu in Safari,
                            then tap <PlusSquare size={12} className="inline" /> <b>Add to Home Screen</b>.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-300 mt-1">
                            Add MindFlow to your home screen for the full app experience.
                        </p>
                    )}
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={handleInstall}
                            className="px-3 py-1.5 text-xs font-bold bg-[#00C875] hover:bg-[#00b067] rounded-xl transition"
                        >
                            {isIos() ? 'How to install' : 'Install'}
                        </button>
                        <button
                            onClick={dismiss}
                            className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white transition"
                        >
                            Later
                        </button>
                    </div>
                </div>
                <button onClick={dismiss} aria-label="Dismiss" className="p-1 text-gray-400 hover:text-white flex-shrink-0">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
