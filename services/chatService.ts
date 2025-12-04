import { ChatMessage, Room, User, SignalBatch } from '../types'; 
import { db } from '../src/firebaseConfig'; 
import { 
  ref, set, push, onChildAdded, onValue, remove, update, onDisconnect, query, limitToLast, Unsubscribe 
} from 'firebase/database';

export const AVAILABLE_ROOMS: Room[] = [
    { id: '40m', frequency: '7.040', name: '40m Calling', description: 'General CW calling frequency', userCount: 0 },
    { id: '20m', frequency: '14.060', name: '20m QRP', description: 'Low power operations', userCount: 0 },
    { id: '80m', frequency: '3.560', name: '80m Night', description: 'Regional night-time chat', userCount: 0 },
    { id: '15m', frequency: '21.060', name: '15m DX', description: 'Long distance contact', userCount: 0 },
    { id: '10m', frequency: '28.060', name: '10m Tech', description: 'Technician band CW', userCount: 0 }
];

const DB_PREFIX = 'morse_chat';

class ChatService {
    private messageListeners: ((msg: ChatMessage) => void)[] = [];
    private userListeners: ((users: User[]) => void)[] = [];
    
    // --- BATCHING STATE ---
    private batchBuffer: { off: number; state: 0 | 1 }[] = []; 
    private batchBaseTime: number | null = null;
    private batchTimer: NodeJS.Timeout | null = null;
    private sequenceCounter = 0;
    
    private currentUser: User | null = null;
    private currentRoomId: string | null = null;
    
    // Listeners
    private unsubscribeUsers: Unsubscribe | null = null;
    private unsubscribeMsgs: Unsubscribe | null = null;
    private unsubscribeRealtime: Unsubscribe | null = null;
    private unsubscribeSignals: Unsubscribe | null = null;

    constructor() {}

    // --- SIGNAL API (BATCHED) ---

    public sendSignal(state: 0 | 1) {
        if (!this.currentUser || !this.currentRoomId) return;

        const now = Date.now();

        if (this.batchBaseTime === null) {
            this.batchBaseTime = now;
            this.batchBuffer = [{ off: 0, state: state }]; 
            this.batchTimer = setTimeout(() => this.flushBatch(), 100); 
        } else {
            const relativeTime = now - this.batchBaseTime;
            this.batchBuffer.push({ off: relativeTime, state: state });
        }
    }

    private flushBatch() {
        if (!this.currentUser || !this.currentRoomId || !this.batchBaseTime) return;

        const signalRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/signals`);
        
        const batch: SignalBatch = {
            senderId: this.currentUser.id,
            baseTime: this.batchBaseTime,
            events: this.batchBuffer, 
            seq: this.sequenceCounter++
        };

        push(signalRef, batch);

        this.batchBaseTime = null;
        this.batchBuffer = [];
        this.batchTimer = null;
    }

    public subscribeToSignals(callback: (batch: SignalBatch) => void) {
        if (!this.currentRoomId) return () => {};

        const signalsRef = query(
            ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/signals`),
            limitToLast(50) 
        );

        this.unsubscribeSignals = onChildAdded(signalsRef, (snapshot) => {
            const batch = snapshot.val() as SignalBatch;
            // Ignore old batches (>10s ago) and our own batches
            if (Date.now() - batch.baseTime < 10000 && batch.senderId !== this.currentUser?.id) {
                callback(batch);
            }
        });

        return this.unsubscribeSignals;
    }

    // --- STANDARD METHODS (Restored) ---

    public async joinRoom(user: User, roomId: string) {
        if (this.currentRoomId) this.leaveRoom();

        this.currentUser = user;
        this.currentRoomId = roomId;

        // 1. Add User to Presence
        const userRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users/${user.id}`);
        await set(userRef, { ...user, isLocal: false });
        onDisconnect(userRef).remove();

        // 2. Listen for Users (Use onValue for full list)
        const usersRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users`);
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

        // 3. Listen for Messages (History)
        const messagesRef = query(ref(db, `${DB_PREFIX}/rooms/${roomId}/messages`), limitToLast(50));
        // We use onChildAdded to build the list progressively
        this.unsubscribeMsgs = onChildAdded(messagesRef, (snapshot) => {
             const msg = snapshot.val() as ChatMessage;
             this.notifyMessageListeners(msg);
        });
    }

    public leaveRoom() {
        if (!this.currentUser || !this.currentRoomId) return;

        const userRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        remove(userRef);

        if (this.unsubscribeUsers) { this.unsubscribeUsers(); this.unsubscribeUsers = null; }
        if (this.unsubscribeMsgs) { this.unsubscribeMsgs(); this.unsubscribeMsgs = null; }
        if (this.unsubscribeRealtime) { this.unsubscribeRealtime(); this.unsubscribeRealtime = null; }
        if (this.unsubscribeSignals) { this.unsubscribeSignals(); this.unsubscribeSignals = null; }

        this.currentRoomId = null;
    }

    public sendMessage(text: string) {
        if (!this.currentUser || !this.currentRoomId) return;

        const msgsRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/messages`);
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

    public subscribeToMessages(callback: (msg: ChatMessage) => void) {
        this.messageListeners.push(callback);
        return () => {
            this.messageListeners = this.messageListeners.filter(l => l !== callback);
        };
    }

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
