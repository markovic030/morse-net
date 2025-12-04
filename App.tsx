import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMorseKeyer } from './hooks/useMorseKeyer';
import { ChatInterface } from './components/ChatInterface';
import { LoginScreen } from './components/LoginScreen';
import { Lobby } from './components/Lobby';
import { chatService, AVAILABLE_ROOMS } from './services/chatService';
import { KeyerSettings, ChatMessage, User } from './types';
import { Settings } from 'lucide-react';
// NEW: Import the Jitter Buffer hook
import { useJitterBuffer } from './hooks/useJitterBuffer';

type AppState = 'login' | 'lobby' | 'chat';

const App: React.FC = () => {
    // --- App State ---
    const [view, setView] = useState<AppState>('login');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
    
    // --- Chat State ---
    const [inputBuffer, setInputBuffer] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    // --- Keyer Settings ---
    const [settings, setSettings] = useState<KeyerSettings>({
        wpm: 20,
        tone: 700,
        vol: 40,
        mode: 'iambic-b',
        polarity: 'normal'
    });
    const [showSettings, setShowSettings] = useState(false);
    
    // --- Visual Paddle State ---
    const [visualLeft, setVisualLeft] = useState(false);
    const [visualRight, setVisualRight] = useState(false);

    // --- Keyer Logic Initialization ---
    const handleCharDecoded = useCallback((char: string) => {
        setInputBuffer(prev => prev + char);
    }, []);

    const handleWordGap = useCallback(() => {
        setInputBuffer(prev => prev.endsWith(' ') ? prev : prev + ' ');
    }, []);

    const { setPaddle, playString, isTransmitting, stopTone } = useMorseKeyer(settings, handleCharDecoded, handleWordGap);

    // =========================================================
    // 1. TRUE REMOTE KEYING: REMOTE AUDIO ENGINE
    // =========================================================
    // We need a dedicated oscillator for the *remote* signal so it doesn't 
    // conflict with your local keyer's state.
    const remoteAudioCtx = useRef<AudioContext | null>(null);
    const remoteOsc = useRef<OscillatorNode | null>(null);
    const remoteGain = useRef<GainNode | null>(null);

    const startRemoteTone = useCallback(() => {
        if (!remoteAudioCtx.current) {
            remoteAudioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (remoteAudioCtx.current.state === 'suspended') {
            remoteAudioCtx.current.resume();
        }
        
        // If already playing, don't restart
        if (remoteOsc.current) return;

        const osc = remoteAudioCtx.current.createOscillator();
        const gain = remoteAudioCtx.current.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(settings.tone, remoteAudioCtx.current.currentTime); // Use same tone as settings
        
        gain.gain.setValueAtTime(0, remoteAudioCtx.current.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, remoteAudioCtx.current.currentTime + 0.005); // Smooth attack

        osc.connect(gain);
        gain.connect(remoteAudioCtx.current.destination);
        osc.start();

        remoteOsc.current = osc;
        remoteGain.current = gain;
    }, [settings.tone]);

    const stopRemoteTone = useCallback(() => {
        if (remoteOsc.current && remoteGain.current && remoteAudioCtx.current) {
            const osc = remoteOsc.current;
            const gain = remoteGain.current;
            const ctx = remoteAudioCtx.current;

            // Smooth release
            gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.005);
            
            setTimeout(() => {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
            }, 10); // Wait for release

            remoteOsc.current = null;
            remoteGain.current = null;
        }
    }, []);

    // =========================================================
    // 2. TRUE REMOTE KEYING: RECEIVER (JITTER BUFFER)
    // =========================================================
    // Initialize the Time Machine
    const { addEvent } = useJitterBuffer(startRemoteTone, stopRemoteTone);

    // Subscribe to incoming raw signals
    useEffect(() => {
        // Only subscribe if we are in a room
        if (view === 'chat' && currentRoomId) {
            const unsubSignals = chatService.subscribeToSignals((event) => {
                addEvent(event);
            });
            return () => {
                unsubSignals();
                stopRemoteTone(); // Cleanup on unmount/leave
            };
        }
    }, [view, currentRoomId, addEvent, stopRemoteTone]);


    // =========================================================
    // 3. TRUE REMOTE KEYING: SENDER (BROADCAST)
    // =========================================================
    useEffect(() => {
        if (view === 'chat') {
            // Update Presence Status (visual "TX" indicator)
            chatService.updateStatus(isTransmitting ? 'tx' : 'idle');

            // --- SEND RAW SIGNAL ---
            // Whenever your local keyer starts/stops transmitting, we send that state to the network.
            // 1 = Key Down, 0 = Key Up
            chatService.sendSignal(isTransmitting ? 1 : 0);
        }
    }, [isTransmitting, view]);


    // --- Service Subscription (Existing) ---
    useEffect(() => {
        const unsubMsg = chatService.subscribeToMessages((msg) => {
            setMessages(prev => [...prev, msg]);
            
            // MODIFIED: Only play computer-generated audio for SYSTEM messages.
            // For user messages, we rely on the True Remote Keying (Raw Audio) we added above.
            // If you keep playString() here, you will hear "Double Audio" (Raw + Computer).
            if (msg.isSystem && msg.senderId !== currentUser?.id) {
                // Keep playing system messages (e.g., "CONNECTED") with computer voice
                playString(msg.text); 
            }
        });

        const unsubUsers = chatService.subscribeToUsers((updatedUsers) => {
            setUsers(updatedUsers);
        });

        return () => {
            unsubMsg();
            unsubUsers();
        };
    }, [currentUser, playString]); 

    // --- Actions ---
    const handleLogin = (callsign: string) => {
        const user: User = {
            id: crypto.randomUUID(),
            callsign: callsign,
            isLocal: true,
            status: 'idle'
        };
        setCurrentUser(user);
        setView('lobby');
    };

    const handleJoinRoom = (roomId: string) => {
        if (!currentUser) return;
        setCurrentRoomId(roomId);
        setMessages([]); // Clear previous messages
        chatService.joinRoom(currentUser, roomId);
        setView('chat');
    };

    const handleLeaveRoom = () => {
        chatService.leaveRoom();
        setCurrentRoomId(null);
        setView('lobby');
        stopTone();
        // Also kill remote tone
        stopRemoteTone();
        setMessages([]);
    };

    const handleSendMessage = () => {
        const text = inputBuffer.trim();
        if (!text) return;
        chatService.sendMessage(text);
        setInputBuffer('');
    };

    // --- Paddle Interaction ---
    const handleInteraction = (side: 'left' | 'right', pressed: boolean) => {
        // Only allow transmission in chat mode
        if (view === 'chat') {
            setPaddle(side, pressed);
            if (side === 'left') setVisualLeft(pressed);
            if (side === 'right') setVisualRight(pressed);
        }
    };

    // Keyboard Bindings
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            
            // Iambic Controls
            if (e.code === 'KeyZ' || e.code === 'ArrowLeft') handleInteraction('left', true);
            if (e.code === 'KeyX' || e.code === 'ArrowRight') handleInteraction('right', true);
            
            // Straight Key (Spacebar)
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                if (settings.mode === 'straight') {
                    handleInteraction('left', true);
                }
            }

            // Chat Controls
            if (e.code === 'Enter' && view === 'chat') handleSendMessage();
            if (e.code === 'Backspace') setInputBuffer(prev => prev.slice(0, -1));
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'KeyZ' || e.code === 'ArrowLeft') handleInteraction('left', false);
            if (e.code === 'KeyX' || e.code === 'ArrowRight') handleInteraction('right', false);
            
            if (e.code === 'Space' && settings.mode === 'straight') {
                handleInteraction('left', false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        // Safety: Global release listener to prevent "stuck" keys if dragging out of window/component
        const handleGlobalRelease = () => {
             handleInteraction('left', false);
             handleInteraction('right', false);
        };
        window.addEventListener('mouseup', handleGlobalRelease);
        window.addEventListener('touchend', handleGlobalRelease);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleGlobalRelease);
            window.removeEventListener('touchend', handleGlobalRelease);
        };
    }, [view, inputBuffer, settings.mode]); 

    return (
        <div className="flex flex-col h-dvh max-w-4xl mx-auto p-4 md:p-6 gap-4">
            
            {/* Header (Only show in Lobby or Chat) */}
            {view !== 'login' && (
                <header className="flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full transition-all duration-100 ${isTransmitting ? 'bg-primary shadow-[0_0_15px_rgba(59,130,246,0.8)] scale-110' : 'bg-element'}`}></div>
                        <h1 className="text-xl font-bold tracking-tight">Morse<span className="text-primary">Pro</span> Net</h1>
                    </div>
                    
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg border transition-all ${showSettings ? 'bg-active border-textMuted text-white' : 'bg-transparent border-element text-textMuted hover:bg-element'}`}
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </header>
            )}

            {/* Settings Drawer */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showSettings && view !== 'login' ? 'max-h-60 opacity-100 mb-4' : 'max-h-0 opacity-0'}`}>
                <div className="bg-panel border border-element rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-textMuted uppercase">WPM: {settings.wpm}</label>
                        <input 
                            type="range" min="5" max="40" value={settings.wpm} 
                            onChange={(e) => setSettings({...settings, wpm: Number(e.target.value)})}
                            className="w-full h-2 bg-element rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-textMuted uppercase">Tone: {settings.tone}Hz</label>
                        <input 
                            type="range" min="400" max="1000" value={settings.tone} 
                            onChange={(e) => setSettings({...settings, tone: Number(e.target.value)})}
                            className="w-full h-2 bg-element rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                     <div className="space-y-1">
                        <label className="text-xs font-bold text-textMuted uppercase">Mode</label>
                        <select 
                            value={settings.mode}
                            onChange={(e) => setSettings({...settings, mode: e.target.value as any})}
                            className="w-full bg-element text-sm p-1.5 rounded-md border border-element outline-none focus:border-primary"
                        >
                            <option value="straight">Straight Key</option>
                            <option value="iambic-a">Iambic A</option>
                            <option value="iambic-b">Iambic B</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 min-h-0 relative z-10">
                {view === 'login' && (
                    <LoginScreen onJoin={handleLogin} />
                )}
                
                {view === 'lobby' && currentUser && (
                    <Lobby 
                        rooms={AVAILABLE_ROOMS} 
                        onSelectRoom={handleJoinRoom} 
                        userCallsign={currentUser.callsign}
                    />
                )}
                
                {view === 'chat' && currentRoomId && (
                    <ChatInterface 
                        messages={messages} 
                        users={users}
                        currentInput={inputBuffer}
                        frequency={AVAILABLE_ROOMS.find(r => r.id === currentRoomId)?.frequency || '0.000'}
                        onClearInput={() => setInputBuffer('')}
                        onSendMessage={handleSendMessage}
                        onLeaveRoom={handleLeaveRoom}
                    />
                )}
            </main>

            {/* Paddles (Only in Chat) */}
            {view === 'chat' && (
                <section className="h-40 md:h-48 shrink-0 flex gap-4 mt-2 select-none touch-none">
                    {/* Left Paddle / Straight Key */}
                    <div 
                        className={`flex-1 rounded-2xl border transition-all duration-75 cursor-pointer relative overflow-hidden group
                            ${visualLeft 
                                ? 'bg-element border-primary translate-y-1' 
                                : 'bg-panel border-element hover:bg-element'
                            }
                        `}
                        onMouseDown={(e) => { e.preventDefault(); handleInteraction('left', true); }}
                        onMouseUp={(e) => { e.preventDefault(); handleInteraction('left', false); }}
                        onMouseLeave={() => handleInteraction('left', false)}
                        onTouchStart={(e) => { e.preventDefault(); handleInteraction('left', true); }}
                        onTouchEnd={(e) => { e.preventDefault(); handleInteraction('left', false); }}
                    >
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className={`text-6xl font-mono transition-colors ${visualLeft ? 'text-primary' : 'text-element'}`}>•</span>
                            <span className="text-xs font-bold tracking-widest text-textMuted mt-2">
                                {settings.mode === 'straight' ? 'STRAIGHT KEY (SPACE)' : 'DIT (Z)'}
                            </span>
                        </div>
                    </div>

                    {/* Right Paddle (Hidden in Straight Mode) */}
                    {settings.mode !== 'straight' && (
                        <div 
                            className={`flex-1 rounded-2xl border transition-all duration-75 cursor-pointer relative overflow-hidden group
                                ${visualRight 
                                    ? 'bg-element border-primary translate-y-1' 
                                    : 'bg-panel border-element hover:bg-element'
                                }
                            `}
                            onMouseDown={(e) => { e.preventDefault(); handleInteraction('right', true); }}
                            onMouseUp={(e) => { e.preventDefault(); handleInteraction('right', false); }}
                            onMouseLeave={() => handleInteraction('right', false)}
                            onTouchStart={(e) => { e.preventDefault(); handleInteraction('right', true); }}
                            onTouchEnd={(e) => { e.preventDefault(); handleInteraction('right', false); }}
                        >
                             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className={`text-6xl font-mono transition-colors ${visualRight ? 'text-primary' : 'text-element'}`}>-</span>
                                <span className="text-xs font-bold tracking-widest text-textMuted mt-2">DAH (X)</span>
                            </div>
                        </div>
                    )}
                </section>
            )}
            
            {/* Footer for non-chat views */}
            {view !== 'chat' && (
                <div className="text-center text-textMuted text-xs mt-auto opacity-50">
                    <p>Designed for High Fidelity Morse Operations</p>
                </div>
            )}
        </div>
    );
};

export default App;
