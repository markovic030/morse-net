import { useEffect, useRef } from 'react';
import { SignalEvent } from '../types';

// How far behind real-time do we play? (150ms is a good balance for internet)
const BUFFER_DELAY_MS = 150; 

export const useJitterBuffer = (
    playTone: () => void, 
    stopTone: () => void
) => {
    const queue = useRef<SignalEvent[]>([]);
    const timeOffset = useRef<number | null>(null);
    const lastState = useRef<0 | 1>(0);
    
    // Safety: If no packet arrives for 2 seconds, kill sound (anti-stuck key)
    const watchdogTimer = useRef<NodeJS.Timeout | null>(null);

    // 1. The "Push" function - ChatService calls this when data arrives
    const addEvent = (event: SignalEvent) => {
        // If this is the FIRST packet we've ever seen from this stream,
        // establish the time synchronization.
        if (timeOffset.current === null) {
            // My Time = Sender Time + Network Latency + Buffer
            // We approximate by saying: "Play this packet 150ms from NOW"
            const playTimeTarget = Date.now() + BUFFER_DELAY_MS;
            timeOffset.current = playTimeTarget - event.timestamp;
        }
        
        queue.current.push(event);
        // Keep queue sorted just in case packets arrived out of order
        queue.current.sort((a, b) => a.timestamp - b.timestamp);
    };

    // 2. The Playback Loop - Runs 60 times a second
    useEffect(() => {
        let animationFrameId: number;

        const processQueue = () => {
            const now = Date.now();

            if (timeOffset.current !== null && queue.current.length > 0) {
                // Peek at the first event
                const nextEvent = queue.current[0];
                const targetPlayTime = nextEvent.timestamp + timeOffset.current;

                // Is it time to play this event yet?
                if (now >= targetPlayTime) {
                    // YES. Execute the state change.
                    if (nextEvent.state === 1 && lastState.current === 0) {
                        playTone();
                        // Reset watchdog
                        if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
                        watchdogTimer.current = setTimeout(() => {
                            stopTone();
                            lastState.current = 0;
                        }, 2000); // 2s max tone duration
                    } else if (nextEvent.state === 0 && lastState.current === 1) {
                        stopTone();
                        if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
                    }

                    lastState.current = nextEvent.state;
                    
                    // Remove from queue
                    queue.current.shift();
                }
            }
            
            animationFrameId = requestAnimationFrame(processQueue);
        };

        animationFrameId = requestAnimationFrame(processQueue);

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
            stopTone();
        };
    }, [playTone, stopTone]);

    return { addEvent };
};
