
import { ChatMessage, Room, User } from '../types';
import { db } from '../firebaseConfig';
import firebase from 'firebase/app';
import 'firebase/database';

// Standard Amateur Radio CW Frequencies
export const AVAILABLE_ROOMS: Room[] = [
    { id: '40m', frequency: '7.040', name: '40m Calling', description: 'General CW calling frequency', userCount: 0 },
    { id: '20m', frequency: '14.060', name: '20m QRP', description: 'Low power operations', userCount: 0 },
    { id: '80m', frequency: '3.560', name: '80m Night', description: 'Regional night-time chat', userCount: 0 },
    { id: '15m', frequency: '21.060', name: '15m DX', description: 'Long distance contact', userCount: 0 },
    { id: '10m', frequency: '28.060', name: '10m Tech', description: 'Technician band CW', userCount: 0 }
];

// DATA NAMESPACING
// We prefix all paths with 'morse_chat/' so this app doesn't accidentally 
// overwrite data from your 'renotrack' app if it uses the Realtime Database.
const DB_PREFIX = 'morse_chat';

class ChatService {
    private messageListeners: ((msg: ChatMessage) => void)[] = [];
    private userListeners: ((users: User[]) => void)[] = [];
    
    private currentUser: User | null = null;
    private currentRoomId: string | null = null;
    
    // Firebase References (v8 / compat style)
    private msgRef: firebase.database.Query | null = null;
    private realtimeMsgRef: firebase.database.Query | null = null;
    private usersRef: firebase.database.Reference | null = null;

    constructor() {}

    // --- Public API ---

    public async joinRoom(user: User, roomId: string) {
        if (this.currentRoomId) this.leaveRoom();

        this.currentUser = user;
        this.currentRoomId = roomId;

        // 1. Add User to Firebase Presence System
        // Path: morse_chat/rooms/{roomId}/users/{userId}
        const userRef = db.ref(`${DB_PREFIX}/rooms/${roomId}/users/${user.id}`);
        
        // Set user data
        await userRef.set({ ...user, isLocal: false });

        // Magic trick: Remove user automatically if they close the tab or lose internet
        userRef.onDisconnect().remove();

        // 2. Listen for Users in this room
        this.usersRef = db.ref(`${DB_PREFIX}/rooms/${roomId}/users`);
        this.usersRef.on('value', (snapshot) => {
            const data = snapshot.val();
            const userList: User[] = [];
            if (data) {
                Object.values(data).forEach((u: any) => {
                    userList.push({
                        ...u,
                        isLocal: u.id === this.currentUser?.id
                    });
                });
            }
            this.notifyUserListeners(userList);
        });

        // 3. Listen for Messages (Last 50)
        // Path: morse_chat/rooms/{roomId}/messages
        this.msgRef = db.ref(`${DB_PREFIX}/rooms/${roomId}/messages`).limitToLast(50);
        
        // Listen to 'child_added' equivalent for audio playback
        // We capture new messages arriving to trigger audio
        this.realtimeMsgRef = db.ref(`${DB_PREFIX}/rooms/${roomId}/messages`).limitToLast(1);
        
        this.realtimeMsgRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const msg = Object.values(data)[0] as ChatMessage;
                // Only emit if it's recent (prevents playing old history on join)
                if (Date.now() - msg.timestamp < 3000) {
                    this.notifyMessageListeners(msg);
                }
            }
        });
        
        // We also want to load history immediately for the UI
        this.msgRef.on('value', (snapshot) => {
             // This listener fires once with the last 50 messages, then updates
             const data = snapshot.val();
             if (data) {
                 // For now, we iterate and send them if needed, but the realtimeMsgRef handles the "new" ones
                 // logic preserved from original file structure
             }
        });
    }

    public leaveRoom() {
        if (!this.currentUser || !this.currentRoomId) return;

        // Remove user from DB manually
        const userRef = db.ref(`${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        userRef.remove();

        // Detach listeners
        if (this.usersRef) this.usersRef.off();
        if (this.msgRef) this.msgRef.off();
        if (this.realtimeMsgRef) this.realtimeMsgRef.off();

        this.currentRoomId = null;
        this.msgRef = null;
        this.realtimeMsgRef = null;
        this.usersRef = null;
    }

    public sendMessage(text: string) {
        if (!this.currentUser || !this.currentRoomId) return;

        const msgsRef = db.ref(`${DB_PREFIX}/rooms/${this.currentRoomId}/messages`);
        const newMsgRef = msgsRef.push();
        
        const msg: ChatMessage = {
            id: newMsgRef.key!,
            senderId: this.currentUser.id,
            senderCallsign: this.currentUser.callsign,
            text: text,
            timestamp: Date.now()
        };

        newMsgRef.set(msg);
    }

    public updateStatus(status: 'tx' | 'rx' | 'idle') {
        if (!this.currentUser || !this.currentRoomId) return;
        
        const userRef = db.ref(`${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        userRef.update({ status });
    }

    // --- Subscriptions ---

    public subscribeToMessages(callback: (msg: ChatMessage) => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }
    
    private get listeners() { return this.messageListeners; }
    private set listeners(val) { this.messageListeners = val; }

    public subscribeToUsers(callback: (users: User[]) => void) {
        this.userListeners.push(callback);
        // Initial push if we have data (omitted to match original flow mostly)
        return () => {
            this.userListeners = this.userListeners.filter(l => l !== callback);
        };
    }

    private notifyMessageListeners(msg: ChatMessage) {
        this.messageListeners.forEach(l => l(msg));
    }

    private notifyUserListeners(users: User[]) {
        this.userListeners.forEach(l => l(users));
    }
}

export const chatService = new ChatService();
