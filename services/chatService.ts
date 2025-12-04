import { ChatMessage, Room, User, SignalBatch } from '../types'; 
import { db } from '../src/firebaseConfig'; 
import { 
  ref, set, push, onChildAdded, remove, update, onDisconnect, query, limitToLast, Unsubscribe 
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
    private batchBuffer: number[] = []; // Stores relative timings
    private batchBaseTime: number | null = null;
    private batchTimer: NodeJS.Timeout | null = null;
    private sequenceCounter = 0;
    
    private currentUser: User | null = null;
    private currentRoomId: string | null = null;
    private unsubscribeUsers: Unsubscribe | null = null;
    private unsubscribeRealtime: Unsubscribe | null = null;

    // --- SIGNAL API (BATCHED) ---

    // state: 1 (Key Down) or 0 (Key Up)
    public sendSignal(state: 0 | 1) {
        if (!this.currentUser || !this.currentRoomId) return;

        const now = Date.now();

        // 1. Start a new batch if one isn't running
        if (this.batchBaseTime === null) {
            this.batchBaseTime = now;
            this.batchBuffer = [0]; // First event is always at relative time 0
            
            // Schedule the send
            this.batchTimer = setTimeout(() => this.flushBatch(), 100); // 100ms batch window
        } else {
            // 2. Add to existing batch
            const relativeTime = now - this.batchBaseTime;
            this.batchBuffer.push(relativeTime);
        }
    }

    private flushBatch() {
        if (!this.currentUser || !this.currentRoomId || !this.batchBaseTime) return;

        const signalRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/signals`);
        
        const batch: SignalBatch = {
            senderId: this.currentUser.id,
            baseTime: this.batchBaseTime,
            events: this.batchBuffer, // e.g. [0, 85, 120] (On, Off, On)
            seq: this.sequenceCounter++
        };

        push(signalRef, batch);

        // Reset
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

        const unsub = onChildAdded(signalsRef, (snapshot) => {
            const batch = snapshot.val() as SignalBatch;
            // Ignore old batches (>10s ago) and our own batches
            if (Date.now() - batch.baseTime < 10000 && batch.senderId !== this.currentUser?.id) {
                callback(batch);
            }
        });

        return unsub;
    }

    // --- (Keep existing joinRoom, leaveRoom, sendMessage logic below...) ---
    // Copy the joinRoom/leaveRoom/sendMessage/updateStatus logic from previous versions here
    // For brevity, I am showing the critical BATCHING changes above.
    // ...
    // DO NOT FORGET TO INCLUDE THE STANDARD METHODS (joinRoom, leaveRoom, etc)
    // ...
    
    // <PASTE THE REST OF YOUR STANDARD METHODS HERE>
    
    // --- Rest of the standard methods for context: ---
    public async joinRoom(user: User, roomId: string) {
        if (this.currentRoomId) this.leaveRoom();
        this.currentUser = user;
        this.currentRoomId = roomId;
        const userRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users/${user.id}`);
        await set(userRef, { ...user, isLocal: false });
        onDisconnect(userRef).remove();
        
        // Listeners...
        const usersRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users`);
        this.unsubscribeUsers = onChildAdded(usersRef, () => {}); // specific logic omitted
        // ... (use your existing joinRoom logic)
    }
    
    public leaveRoom() {
        // ... (use your existing leaveRoom logic)
        this.currentRoomId = null;
    }

    public sendMessage(text: string) {
        // ... (use your existing sendMessage logic)
    }
    
    public updateStatus(status: 'tx' | 'rx' | 'idle') {
         if (!this.currentUser || !this.currentRoomId) return;
         const userRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
         update(userRef, { status });
    }
    
    public subscribeToMessages(cb: any) { this.messageListeners.push(cb); return () => {}; }
    public subscribeToUsers(cb: any) { this.userListeners.push(cb); return () => {}; }
}

export const chatService = new ChatService();
