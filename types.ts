export type KeyerMode = 'straight' | 'iambic-a' | 'iambic-b';
export type Polarity = 'normal' | 'inverse';

export interface KeyerSettings {
    wpm: number;
    tone: number;
    vol: number;
    mode: KeyerMode;
    polarity: Polarity;
}

export interface User {
    id: string;
    callsign: string;
    isLocal: boolean; // Is this the current user?
    status?: 'tx' | 'rx' | 'idle';
}

export interface Room {
    id: string;
    frequency: string; // e.g. "7.040 MHz"
    name: string;      // e.g. "40m Calling"
    description: string;
    userCount: number;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderCallsign: string;
    text: string;
    timestamp: number;
    isSystem?: boolean;
}

export interface PaddleState {
    leftPressed: boolean;
    rightPressed: boolean;
}
export interface SignalEvent {
    senderId: string;
    state: 0 | 1;      // 0 = Silence (Key Up), 1 = Tone (Key Down)
    seq: number;       // To detect lost packets
    timestamp: number; // Sender's local time
}
