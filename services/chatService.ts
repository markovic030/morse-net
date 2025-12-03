import { ChatMessage, Room, User } from '../types';

// Standard Amateur Radio CW Frequencies
export const AVAILABLE_ROOMS: Room[] = [
    { id: '40m', frequency: '7.040', name: '40m Calling', description: 'General CW calling frequency', userCount: 0 },
    { id: '20m', frequency: '14.060', name: '20m QRP', description: 'Low power operations', userCount: 0 },
    { id: '80m', frequency: '3.560', name: '80m Night', description: 'Regional night-time chat', userCount: 0 },
    { id: '15m', frequency: '21.060', name: '15m DX', description: 'Long distance contact', userCount: 0 },
    { id: '10m', frequency: '28.060', name: '10m Tech', description: 'Technician band CW', userCount: 0 }
];

type BroadcastEvent = 
    | { type: 'join'; payload: { user: User; roomId: string } }
    | { type: 'leave'; payload: { userId: string; roomId: string } }
    | { type: 'presence'; payload: { user: User; roomId: string } }
    | { type: 'message'; payload: ChatMessage; roomId: string }
    | { type: 'status'; payload: { userId: string; status: 'tx' | 'rx' | 'idle'; roomId: string } };

class ChatService {
    private channel: BroadcastChannel;
    private listeners: ((msg: ChatMessage) => void)[] = [];
    private userListeners: ((users: User[]) => void)[] = [];
    
    private currentUser: User | null = null;
    private currentRoomId: string | null = null;
    
    // Local state of users in the current room
    private connectedUsers: Map<string, User> = new Map();

    constructor() {
        this.channel = new BroadcastChannel('morse_pro_net_v1');
        this.channel.onmessage = (event) => this.handleEvent(event.data as BroadcastEvent);
        
        // Cleanup on window close
        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });
    }

    // --- Public API ---

    public joinRoom(user: User, roomId: string) {
        // If switching rooms, leave the old one first
        if (this.currentRoomId && this.currentRoomId !== roomId) {
            this.leaveRoom();
        }

        this.currentUser = user;
        this.currentRoomId = roomId;
        this.connectedUsers.clear();
        
        // Add ourselves
        this.connectedUsers.set(user.id, user);
        this.notifyUserListeners();

        // 1. Announce Join
        this.broadcast({ 
            type: 'join', 
            payload: { user, roomId } 
        });

        // 2. Add System Message
        const sysMsg: ChatMessage = {
            id: Date.now().toString(),
            senderId: 'sys',
            senderCallsign: 'SYSTEM',
            text: `CONNECTED TO ${AVAILABLE_ROOMS.find(r => r.id === roomId)?.frequency} MHZ`,
            timestamp: Date.now(),
            isSystem: true
        };
        this.notifyListeners(sysMsg);
    }

    public leaveRoom() {
        if (!this.currentUser || !this.currentRoomId) return;

        this.broadcast({
            type: 'leave',
            payload: { userId: this.currentUser.id, roomId: this.currentRoomId }
        });

        this.currentRoomId = null;
        this.connectedUsers.clear();
        this.notifyUserListeners();
    }

    public sendMessage(text: string) {
        if (!this.currentUser || !this.currentRoomId) return;

        const msg: ChatMessage = {
            id: Date.now().toString(),
            senderId: this.currentUser.id,
            senderCallsign: this.currentUser.callsign,
            text: text,
            timestamp: Date.now()
        };

        // Notify local UI
        this.notifyListeners(msg);

        // Broadcast to others
        this.broadcast({
            type: 'message',
            payload: msg,
            roomId: this.currentRoomId
        });
    }

    public updateStatus(status: 'tx' | 'rx' | 'idle') {
        if (!this.currentUser || !this.currentRoomId) return;
        
        // Update local
        const me = this.connectedUsers.get(this.currentUser.id);
        if (me) {
            me.status = status;
            this.notifyUserListeners();
        }

        // Broadcast
        this.broadcast({
            type: 'status',
            payload: { userId: this.currentUser.id, status, roomId: this.currentRoomId }
        });
    }

    // --- Subscriptions ---

    public subscribeToMessages(callback: (msg: ChatMessage) => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    public subscribeToUsers(callback: (users: User[]) => void) {
        this.userListeners.push(callback);
        // Initial push
        callback(Array.from(this.connectedUsers.values()));
        return () => {
            this.userListeners = this.userListeners.filter(l => l !== callback);
        };
    }

    // --- Internal Logic ---

    private broadcast(event: BroadcastEvent) {
        this.channel.postMessage(event);
    }

    private handleEvent(event: BroadcastEvent) {
        // Filter events not for this room
        // (Note: 'presence' and 'status' might contain roomId in payload or root, normalizing here)
        const eventRoomId = 'roomId' in event ? event.roomId : event.payload.roomId;
        if (eventRoomId !== this.currentRoomId) return;

        switch (event.type) {
            case 'join':
                this.handleJoin(event.payload.user);
                break;
            case 'presence':
                this.handlePresence(event.payload.user);
                break;
            case 'leave':
                this.handleLeave(event.payload.userId);
                break;
            case 'message':
                this.notifyListeners(event.payload);
                break;
            case 'status':
                this.handleStatus(event.payload.userId, event.payload.status);
                break;
        }
    }

    private handleJoin(newUser: User) {
        // Someone joined. 
        // 1. Add them to our list
        this.connectedUsers.set(newUser.id, { ...newUser, isLocal: false });
        this.notifyUserListeners();

        // 2. Announce OUR presence to them (so they know we exist)
        if (this.currentUser && this.currentRoomId) {
            this.broadcast({
                type: 'presence',
                payload: { user: this.currentUser, roomId: this.currentRoomId }
            });
        }
    }

    private handlePresence(existingUser: User) {
        // We received an "I am here" signal
        if (existingUser.id === this.currentUser?.id) return;

        this.connectedUsers.set(existingUser.id, { ...existingUser, isLocal: false });
        this.notifyUserListeners();
    }

    private handleLeave(userId: string) {
        if (this.connectedUsers.has(userId)) {
            this.connectedUsers.delete(userId);
            this.notifyUserListeners();
        }
    }

    private handleStatus(userId: string, status: 'tx' | 'rx' | 'idle') {
        const user = this.connectedUsers.get(userId);
        if (user) {
            user.status = status;
            this.notifyUserListeners();
        }
    }

    private notifyListeners(msg: ChatMessage) {
        this.listeners.forEach(l => l(msg));
    }

    private notifyUserListeners() {
        const users = Array.from(this.connectedUsers.values());
        this.userListeners.forEach(l => l(users));
    }
}

export const chatService = new ChatService();