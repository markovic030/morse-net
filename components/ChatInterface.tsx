import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, User } from '../types';
import { Users, LogOut } from 'lucide-react';
import { UserList } from './UserList';

interface ChatInterfaceProps {
    messages: ChatMessage[];
    users: User[];
    currentInput: string;
    frequency: string;
    onClearInput: () => void;
    onSendMessage: () => void;
    onLeaveRoom: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
    messages, 
    users,
    currentInput, 
    frequency,
    onClearInput, 
    onSendMessage,
    onLeaveRoom
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showUserList, setShowUserList] = useState(false);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, currentInput]);

    return (
        <div className="flex flex-col h-full bg-panel border border-element rounded-2xl overflow-hidden shadow-2xl relative">
            
            {/* Header / Status */}
            <div className="bg-element/50 px-4 py-3 border-b border-element flex justify-between items-center backdrop-blur-sm z-30 relative">
                <div className="flex items-center gap-3">
                    <button onClick={onLeaveRoom} className="p-1.5 hover:bg-element rounded text-textMuted hover:text-white transition-colors" title="Leave Frequency">
                        <LogOut className="w-4 h-4" />
                    </button>
                    <div className="h-4 w-px bg-element"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                        <span className="font-bold text-sm tracking-widest text-textMain font-mono">{frequency} MHz</span>
                    </div>
                </div>
                
                <button 
                    onClick={() => setShowUserList(!showUserList)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-bold ${showUserList ? 'bg-active text-white' : 'bg-transparent text-textMuted hover:bg-element hover:text-white'}`}
                >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">{users.length} OPS</span>
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden flex">
                
                {/* Chat History */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 scroll-smooth">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-textMuted opacity-50 space-y-2 select-none">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                                <polyline points="16 6 12 2 8 6"/>
                                <line x1="12" y1="2" x2="12" y2="15"/>
                            </svg>
                            <span className="text-sm font-mono tracking-widest">FREQUENCY CLEAR</span>
                        </div>
                    )}
                    
                    {messages.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={`flex flex-col ${msg.isSystem ? 'items-center' : 'items-start'}`}
                        >
                            {msg.isSystem ? (
                                <span className="text-[10px] font-mono text-textMuted bg-element/40 px-2 py-1 rounded my-2">
                                    {msg.text}
                                </span>
                            ) : (
                                <>
                                    <div className="flex items-baseline gap-2 mb-1 pl-1">
                                        <span className="text-xs font-bold text-accent font-mono">{msg.senderCallsign}</span>
                                        <span className="text-[10px] text-textMuted">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <div className="bg-element text-textMain px-4 py-2 rounded-lg border border-active font-mono text-sm md:text-base shadow-sm max-w-[85%] break-words">
                                        {msg.text}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* User List Sidebar */}
                <UserList users={users} isOpen={showUserList} onClose={() => setShowUserList(false)} />

            </div>

            {/* Decoder / Input Display */}
            <div className="min-h-[140px] bg-app border-t border-element flex flex-col relative z-30">
                
                {/* Tools */}
                <div className="absolute top-2 right-2 flex gap-2 z-10">
                    <button 
                        onClick={onClearInput} 
                        className="p-2 hover:bg-element rounded-md text-textMuted hover:text-danger transition-colors"
                        title="Clear Buffer"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                    <button 
                        onClick={onSendMessage} 
                        className={`px-3 py-1 rounded-md text-xs font-bold tracking-wider transition-all ${
                            currentInput.trim().length > 0 
                            ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primaryDark' 
                            : 'bg-element text-textMuted cursor-not-allowed'
                        }`}
                        disabled={currentInput.trim().length === 0}
                    >
                        TX (K)
                    </button>
                </div>

                {/* The Decoder Screen */}
                <div className="flex-1 p-6 font-mono text-2xl md:text-3xl text-primary break-all uppercase overflow-y-auto leading-relaxed tracking-wider">
                     {currentInput}<span className="inline-block w-3 h-6 bg-primary ml-1 animate-pulse align-middle"></span>
                </div>

                <div className="px-4 py-2 bg-element/30 text-[10px] text-textMuted font-mono flex justify-between">
                    <span>DECODER ACTIVE</span>
                    <span>KEY: ENABLED</span>
                </div>
            </div>
        </div>
    );
};
