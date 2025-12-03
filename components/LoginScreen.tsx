import React, { useState } from 'react';
import { Radio } from 'lucide-react';

interface LoginScreenProps {
    onJoin: (callsign: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onJoin }) => {
    const [callsign, setCallsign] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (callsign.trim().length >= 3) {
            onJoin(callsign.toUpperCase().trim());
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] h-full p-6 animate-[fadeIn_0.5s_ease-out]">
            <div className="bg-panel border border-element p-8 rounded-2xl w-full max-w-sm shadow-2xl relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl"></div>

                <div className="flex flex-col items-center gap-4 mb-8 relative z-10">
                    <div className="w-16 h-16 bg-element rounded-full flex items-center justify-center border border-active shadow-inner">
                        <Radio className="w-8 h-8 text-primary" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold tracking-tight text-white">Station Login</h2>
                        <p className="text-textMuted text-sm mt-1">Identify yourself, Operator.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-textMuted uppercase ml-1">Callsign</label>
                        <input 
                            type="text" 
                            value={callsign}
                            onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                            maxLength={8}
                            placeholder="W1AW"
                            className="w-full bg-app border border-element text-white text-lg font-mono p-3 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-element"
                            autoFocus
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={callsign.length < 3}
                        className="w-full bg-primary hover:bg-primaryDark disabled:opacity-50 disabled:hover:bg-primary text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-primary/20"
                    >
                        INITIALIZE SYSTEM
                    </button>
                </form>
            </div>
            
            <div className="mt-8 text-center text-textMuted text-xs font-mono">
                MORSE PRO NET // V2.5.0
            </div>
        </div>
    );
};