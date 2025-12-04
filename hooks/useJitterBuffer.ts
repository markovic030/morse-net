import { useEffect, useRef } from 'react';
import { SignalEvent } from '../types';

// Buffer: 300-500ms is standard for Morse over IP
const BUFFER_MS = 400; 
const LOOKAHEAD_MS = 100;

export const useJitterBuffer = (
    ctx: AudioContext | null, 
    scheduleSignal: (state: 0 | 1, time: number) => void
) => {
    const queue = useRef<SignalEvent[]>([]);
    const timeOffset = useRef<number | null>(null);
    
    // Track timing to preserve duration
    const lastSenderTime = useRef<number | null>(null);
    const lastScheduledTime = useRef<number>(0);

    const addEvent = (event: SignalEvent) => {
        if (!ctx) return;

        // Initialize sync on first packet
        if (timeOffset.current === null) {
            const targetTime = ctx.currentTime + (BUFFER_MS / 1000);
            timeOffset.current = targetTime - (event.timestamp / 1000);
        }
        
        queue.current.push(event);

        // --- THE FIX IS HERE ---
        // We sort primarily by Timestamp. We only use Sequence as a tie-breaker.
        queue.current.sort((a, b) => {
            // If timestamps are different, use them (Reliable ordering)
            if (a.timestamp !== b.timestamp) {
                return a.timestamp - b.timestamp;
            }
            // If timestamps are EXACTLY the same (rare), use sequence
            return a.seq - b.seq;
        });
    };

    useEffect(() => {
        let animationFrameId: number;

        const scheduleLoop = () => {
            if (!ctx || timeOffset.current === null) {
                animationFrameId = requestAnimationFrame(scheduleLoop);
                return;
            }

            const lookaheadTime = ctx.currentTime + (LOOKAHEAD_MS / 1000);

            while (queue.current.length > 0) {
                const nextEvent = queue.current[0];
                
                // Calculate ideal play time
                let scheduledTime = (nextEvent.timestamp / 1000) + timeOffset.current;

                // Duration Preservation:
                // Ensure we don't crush the "dit" length if network jitter compressed the packets
                if (lastSenderTime.current !== null && lastScheduledTime.current > 0) {
                    const duration = (nextEvent.timestamp - lastSenderTime.current) / 1000;
                    if (duration > 0) {
                        scheduledTime = Math.max(scheduledTime, lastScheduledTime.current + duration);
                    }
                }

                if (scheduledTime < lookaheadTime) {
                    // Schedule it!
                    // We use Math.max(currentTime) to ensure we don't error by scheduling in the past
                    const playTime = Math.max(ctx.currentTime, scheduledTime);
                    
                    scheduleSignal(nextEvent.state, playTime);
                    
                    // Update trackers
                    lastScheduledTime.current = playTime;
                    lastSenderTime.current = nextEvent.timestamp;

                    queue.current.shift();
                } else {
                    break;
                }
            }
            animationFrameId = requestAnimationFrame(scheduleLoop);
        };

        animationFrameId = requestAnimationFrame(scheduleLoop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [ctx, scheduleSignal]);

    return { addEvent };
};
