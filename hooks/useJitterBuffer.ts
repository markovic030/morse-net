import { useEffect, useRef } from 'react';
import { SignalBatch } from '../types';

const BUFFER_MS = 500; 

export const useJitterBuffer = (
    ctx: AudioContext | null, 
    scheduleSignal: (state: 0 | 1, time: number) => void
) => {
    const timeOffset = useRef<number | null>(null);
    // Tracks the current state of the remote key (starts at 0 = UP)
    const remoteState = useRef<0 | 1>(0);

    const addBatch = (batch: SignalBatch) => {
        if (!ctx) return;

        // Sync Clock on First Batch
        if (timeOffset.current === null) {
            const targetTime = ctx.currentTime + (BUFFER_MS / 1000);
            timeOffset.current = targetTime - (batch.baseTime / 1000);
        }

        // Calculate when this batch starts playing
        const batchStartTime = (batch.baseTime / 1000) + timeOffset.current;
        
        // Schedule every event in the batch
        batch.events.forEach((relativeOffset) => {
            // Toggle state: If we were UP, now we are DOWN.
            const newState = remoteState.current === 0 ? 1 : 0;
            
            // Calculate exact time for this specific dit/dah
            // Math.max ensures we don't crash by scheduling in the past
            const playTime = Math.max(ctx.currentTime, batchStartTime + (relativeOffset / 1000));
            
            scheduleSignal(newState, playTime);
            
            // Update state tracker
            remoteState.current = newState;
        });
    };

    return { addEvent: addBatch };
};
