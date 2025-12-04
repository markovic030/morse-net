import { ChatMessage, Room, User, SignalEvent } from '../types'; 
import { db } from '../src/firebaseConfig'; 
import { 
  ref, 
  set, 
  push, 
  onValue,
  onChildAdded, // <--- NEW IMPORT
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
    
    // NEW: Sequence counter to prevent ordering issues with fast keying
    private sequenceCounter = 0;

    private currentUser: User | null = null;
    private currentRoomId: string | null = null;
    
    private unsubscribeUsers: Unsubscribe | null = null;
    private unsubscribeMsgs: Unsubscribe | null = null;
    private unsubscribeRealtime: Unsubscribe | null = null;

    constructor() {}

    // --- Public API ---

    public async joinRoom(user: User, roomId: string) {
        if (this.currentRoomId) this.leaveRoom();

        this.currentUser = user;
        this.currentRoomId = roomId;

        const userRef = ref(db, `${DB_PREFIX}/rooms/${roomId}/users/${user.id}`);
        await set(userRef, { ...user, isLocal: false });
        onDisconnect(userRef).remove();

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

        const messagesRef = query(
            ref(db, `${DB_PREFIX}/rooms/${roomId}/messages`), 
            limitToLast(50)
        );
        
        const realtimeRef = query(
            ref(db, `${DB_PREFIX}/rooms/${roomId}/messages`), 
            limitToLast(1)
        );
        
        this.unsubscribeRealtime = onValue(realtimeRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const msg = Object.values(data)[0] as ChatMessage;
                if (Date.now() - msg.timestamp < 3000) {
                    this.notifyMessageListeners(msg);
                }
            }
        });
        
        this.unsubscribeMsgs = onValue(messagesRef, (snapshot) => {
             // History load if needed
        });
    }

    public leaveRoom() {
        if (!this.currentUser || !this.currentRoomId) return;

        const userRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        remove(userRef);

        if (this.unsubscribeUsers) { this.unsubscribeUsers(); this.unsubscribeUsers = null; }
        if (this.unsubscribeMsgs) { this.unsubscribeMsgs(); this.unsubscribeMsgs = null; }
        if (this.unsubscribeRealtime) { this.unsubscribeRealtime(); this.unsubscribeRealtime = null; }

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

    // --- SIGNAL METHODS (UPDATED FOR HIGH SPEED) ---

    public sendSignal(state: 0 | 1) {
        if (!this.currentUser || !this.currentRoomId) return;

        const signalRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/signals`);
        
        const event: SignalEvent = {
            senderId: this.currentUser.id,
            state: state,
            // UPDATED: Use counter instead of just Date.now() to preserve strict order
            seq: this.sequenceCounter++,
            timestamp: Date.now()
        };

        push(signalRef, event);
    }

public subscribeToSignals(callback: (event: SignalEvent) => void) {
        if (!this.currentRoomId) return () => {};

        // Listen to last 100 events
        const signalsRef = query(
            ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/signals`),
            limitToLast(100) 
        );

        const unsub = onChildAdded(signalsRef, (snapshot) => {
            const event = snapshot.val() as SignalEvent;
            
            // REMOVED THE TIMESTAMP FILTER
            // We only check senderId. The Jitter Buffer will handle "old" packets
            // by discarding them if they are too far in the past.
            if (event.senderId !== this.currentUser?.id) {
                callback(event);
            }
        });

        return unsub;
    }

    // ------------------------------------------

    public updateStatus(status: 'tx' | 'rx' | 'idle') {
        if (!this.currentUser || !this.currentRoomId) return;
        
        const userRef = ref(db, `${DB_PREFIX}/rooms/${this.currentRoomId}/users/${this.currentUser.id}`);
        update(userRef, { status });
    }

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
