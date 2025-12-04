import { useEffect, useRef } from 'react';
import { SignalEvent } from '../types';

// INCREASED BUFFER: 300ms allows for more network hiccups without stuttering.
// If it still stutters, try 400 or 500.
const BUFFER_DELAY_MS = 500; 

export const useJitterBuffer = (
    playTone: () => void, 
    stopTone: () => void
) => {
    const queue = useRef<SignalEvent[]>([]);
    const timeOffset = useRef<number | null>(null);
    const lastState = useRef<0 | 1>(0);
    
    // Safety & Cleanup timers
    const watchdogTimer = useRef<NodeJS.Timeout | null>(null);
    const resyncTimer = useRef<NodeJS.Timeout | null>(null);

    const addEvent = (event: SignalEvent) => {
        // If we have been silent for a long time, treat this as a "fresh" start
        // This adapts to changing network conditions between sentences.
        if (timeOffset.current === null) {
            const playTimeTarget = Date.now() + BUFFER_DELAY_MS;
            timeOffset.current = playTimeTarget - event.timestamp;
        }
        
        queue.current.push(event);
        // Keep queue sorted (critical for UDP-like jitter)
        queue.current.sort((a, b) => a.timestamp - b.timestamp);
        
        // Clear the "Resync" timer because we are actively receiving data
        if (resyncTimer.current) clearTimeout(resyncTimer.current);
        
        // If no more data arrives for 2 seconds, we reset the sync
        // This ensures the NEXT sentence calculates a fresh delay.
        resyncTimer.current = setTimeout(() => {
            timeOffset.current = null;
        }, 2000);
    };

    // The High-Precision Loop
    useEffect(() => {
        let animationFrameId: number;

        const processQueue = () => {
            const now = Date.now();

            // Only process if we are synced and have data
            if (timeOffset.current !== null && queue.current.length > 0) {
                const nextEvent = queue.current[0];
                const targetPlayTime = nextEvent.timestamp + timeOffset.current;

                // Is it time (or past time) to play this event?
                if (now >= targetPlayTime) {
                    
                    // EXECUTE STATE CHANGE
                    if (nextEvent.state === 1 && lastState.current === 0) {
                        playTone();
                        // Reset stuck-key watchdog
                        if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
                        // Max tone duration 2s (safety)
                        watchdogTimer.current = setTimeout(() => {
                            stopTone();
                            lastState.current = 0;
                        }, 2000); 
                    } else if (nextEvent.state === 0 && lastState.current === 1) {
                        stopTone();
                        if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
                    }

                    lastState.current = nextEvent.state;
                    
                    // Remove processed event
                    queue.current.shift();
                }
            }
            
            animationFrameId = requestAnimationFrame(processQueue);
        };

        animationFrameId = requestAnimationFrame(processQueue);

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
            if (resyncTimer.current) clearTimeout(resyncTimer.current);
            stopTone();
        };
    }, [playTone, stopTone]);

    return { addEvent };
};
