import React from 'react';
import { Room } from '../types';
import { Signal, Users, Radio } from 'lucide-react';

interface LobbyProps {
    rooms: Room[];
    onSelectRoom: (roomId: string) => void;
    userCallsign: string;
}

export const Lobby: React.FC<LobbyProps> = ({ rooms, onSelectRoom, userCallsign }) => {
    return (
        <div className="flex flex-col h-full p-4 md:p-6 animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-6 flex justify-between items-end border-b border-element pb-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Radio className="w-5 h-5 text-accent" />
                        Frequency Select
                    </h2>
                    <p className="text-textMuted text-sm mt-1">Welcome back, <span className="text-primary font-mono font-bold">{userCallsign}</span></p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pb-4">
                {rooms.map((room) => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className="bg-panel border border-element hover:border-primary/50 hover:bg-active/20 p-5 rounded-xl text-left transition-all group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full -mr-4 -mt-4 transition-opacity opacity-0 group-hover:opacity-100"></div>
                        
                        <div className="flex justify-between items-start mb-3 relative z-10">
                            <span className="font-mono text-2xl font-bold text-white group-hover:text-primary transition-colors">
                                {room.frequency}
                            </span>
                            <div className="flex items-center gap-1.5 bg-element/50 px-2 py-1 rounded text-xs text-textMuted">
                                <Users className="w-3 h-3" />
                                <span>{room.userCount}</span>
                            </div>
                        </div>
                        
                        <div className="relative z-10">
                            <h3 className="font-bold text-sm text-textMain">{room.name}</h3>
                            <p className="text-xs text-textMuted mt-1">{room.description}</p>
                        </div>

                        <div className="absolute bottom-4 right-4 text-element group-hover:text-primary/20 transition-colors">
                            <Signal className="w-8 h-8" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};