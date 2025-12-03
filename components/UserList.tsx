import React from 'react';
import { User } from '../types';
import { Wifi } from 'lucide-react';

interface UserListProps {
    users: User[];
    isOpen: boolean;
    onClose: () => void;
}

export const UserList: React.FC<UserListProps> = ({ users, isOpen, onClose }) => {
    return (
        <div className={`
            absolute inset-y-0 right-0 w-64 bg-panel border-l border-element shadow-2xl transform transition-transform duration-300 ease-in-out z-20
            ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}>
            <div className="h-full flex flex-col">
                <div className="p-4 border-b border-element flex justify-between items-center bg-element/20">
                    <h3 className="font-bold text-sm text-textMain flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-primary" />
                        Operators ({users.length})
                    </h3>
                    <button onClick={onClose} className="md:hidden p-1 text-textMuted hover:text-white">
                        ✕
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {users.map(user => (
                        <div key={user.id} className="flex items-center gap-3 p-2 rounded hover:bg-element/50 transition-colors">
                            <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                                user.status === 'tx' 
                                ? 'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse' 
                                : 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.3)]'
                            }`}></div>
                            <div>
                                <div className="font-mono font-bold text-sm text-textMain">
                                    {user.callsign} 
                                    {user.isLocal && <span className="text-xs text-textMuted ml-2 font-sans font-normal border border-element px-1 rounded bg-element/50">YOU</span>}
                                </div>
                                <div className={`text-[10px] font-bold uppercase transition-colors ${
                                    user.status === 'tx' ? 'text-danger' : 'text-textMuted'
                                }`}>
                                    {user.status === 'tx' ? 'TRANSMITTING' : 'LISTENING'}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {users.length === 0 && (
                        <div className="text-center p-4 text-textMuted text-xs">
                            No other stations.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};