import { ChatMessage, Room, User } from '../types';
// CORRECTED IMPORT: Goes up one folder to find firebaseConfig in src/
import { db } from '../src/firebaseConfig'; 
import { 
  ref, 
  set, 
  push, 
  onValue, 
  remove, 
  update, 
  onDisconnect, 
  query, 
  limitToLast,
  Unsubscribe
} from 'firebase/database';

// Standard Amateur Radio CW Frequencies
export const AVAILABLE_ROOMS: Room[] = [
    { id: '40m', frequency: '7.040', name: '40m Calling', description: 'General CW calling frequency', userCount: 0 },
    { id: '20m', frequency: '14.060', name: '20m QRP', description: 'Low power operations', userCount: 0 },
    { id: '80m', frequency: '3.560', name: '80m Night', description: 'Regional night-time chat', userCount: 0 },
    { id: '15m', frequency: '21.060', name: '15m DX', description: 'Long distance contact', userCount: 0 },
    { id: '10m', frequency: '28.060', name: '10m Tech', description: 'Technician band CW', userCount: 0 }
];

// DATA NAMESPACING
const DB_PREFIX = 'morse_chat';

class ChatService {
    private messageListeners: ((msg: ChatMessage) => void)[] = [];
    private userListeners: ((users: User[]) => void)[] = [];
    
    private currentUser: User | null = null;
    private currentRoomId: string | null = null;
    
    // In Modular SDK, we store the "unsubscribe" functions returned by onValue
    private unsubscribeUsers: Unsubscribe | null = null;
    private unsubscribeMsgs: Unsubscribe | null = null;
    private unsubscribeRealtime: Unsubscribe | null = null;

    constructor() {
        // Cleanup on window close
        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });
    }

    // --- Public API ---

    public async joinRoom(user: User, roomId: string) {
        if (this.currentRoomId) this.leaveRoom();

        this.currentUser = user;
        this.currentRoomId = roomId;

        // 1. Add User to Firebase Presence System
        // New Syntax: ref(db, path)
        const userRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users/${user.id}`);
        
        // Set user data
        // New Syntax: set(ref, data)
        await set(userRef, { ...user, isLocal: false });

        // Magic trick: Remove user automatically if they close the tab
        // New Syntax: onDisconnect(ref).remove()
        onDisconnect(userRef).remove();

        // 2. Listen for Users in this room
        const usersRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users`);
        
        // New Syntax: onValue(ref, callback) returns the unsubscribe function
        this.unsubscribeUsers = onValue(usersRef, (snapshot) => {
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
        // New Syntax: query(ref, limitToLast(X))
        const messagesRef = query(
            ref(db, `${DB_PREFIX}/rooms/${roomId}/messages`), 
            limitToLast(50)
        );
        
        // We capture new messages arriving to trigger audio
        const realtimeRef = query(
            ref(db, `${DB_PREFIX}/rooms/${roomId}/messages`), 
            limitToLast(1)
        );
        
        this.unsubscribeRealtime = onValue(realtimeRef, (snapshot) => {
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
        this.unsubscribeMsgs = onValue(messagesRef, (snapshot) => {
             // Optional: Handle history load
        });

        // 4. Send System Message (Local)
         const sysMsg: ChatMessage = {
            id: Date.now().toString(),
            senderId: 'sys',
            senderCallsign: 'SYSTEM',
            text: `CONNECTED TO ${AVAILABLE_ROOMS.find(r => r.id === roomId)?.frequency} MHZ`,
            timestamp: Date.now(),
            isSystem: true
        };
        this.notifyMessageListeners(sysMsg);
    }

    public leaveRoom() {
        if (!this.currentUser || !this.currentRoomId) return;

        // Remove user from DB manually
        const userRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        remove(userRef);

        // Detach listeners using the unsubscribe functions
        if (this.unsubscribeUsers) {
            this.unsubscribeUsers();
            this.unsubscribeUsers = null;
        }
        if (this.unsubscribeMsgs) {
            this.unsubscribeMsgs();
            this.unsubscribeMsgs = null;
        }
        if (this.unsubscribeRealtime) {
            this.unsubscribeRealtime();
            this.unsubscribeRealtime = null;
        }

        this.currentRoomId = null;
    }

    public sendMessage(text: string) {
        if (!this.currentUser || !this.currentRoomId) return;

        const msgsRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/messages`);
        
        // New Syntax: push(ref) creates a new reference with a unique key
        const newMsgRef = push(msgsRef);
        
        const msg: ChatMessage = {
            id: newMsgRef.key!,
            senderId: this.currentUser.id,
            senderCallsign: this.currentUser.callsign,
            text: text,
            timestamp: Date.now()
        };

        set(newMsgRef, msg);
    }

    public updateStatus(status: 'tx' | 'rx' | 'idle') {
        if (!this.currentUser || !this.currentRoomId) return;
        
        const userRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        update(userRef, { status });
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
