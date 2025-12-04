import { useEffect, useRef } from 'react';
import { SignalBatch } from '../types';

const BUFFER_MS = 200; 

export const useJitterBuffer = (
    ctx: AudioContext | null, 
    scheduleSignal: (state: 0 | 1, time: number) => void
) => {
    const timeOffset = useRef<number | null>(null);
    
    // Safety: Auto-kill tone if it gets stuck
    const watchdogTimer = useRef<NodeJS.Timeout | null>(null);

    const addBatch = (batch: SignalBatch) => {
        if (!ctx) return;

        if (timeOffset.current === null) {
            const targetTime = ctx.currentTime + (BUFFER_MS / 1000);
            timeOffset.current = targetTime - (batch.baseTime / 1000);
        }

        const batchStartTime = (batch.baseTime / 1000) + timeOffset.current;
        
        batch.events.forEach((event) => {
            // event is now { off: number, state: 0 | 1 }
            const playTime = Math.max(ctx.currentTime, batchStartTime + (event.off / 1000));
            
            // 1. Schedule the EXPLICIT state (No toggling!)
            scheduleSignal(event.state, playTime);
            
            // 2. Watchdog Logic
            if (event.state === 1) {
                // If turning ON, set a safety timer to turn it OFF in 3 seconds
                if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
                watchdogTimer.current = setTimeout(() => {
                    scheduleSignal(0, ctx.currentTime);
                }, 3000);
            } else {
                // If turning OFF, clear the safety timer
                if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
            }
        });
    };

    return { addEvent: addBatch };
};
