import { useEffect, useRef } from 'react';
import { SignalEvent } from '../types';

const BUFFER_MS = 300; // Latency Target
const LOOKAHEAD_MS = 100; // React Safety Window
const IDLE_TIMEOUT_MS = 2000; // Reset sync if silent for 2 seconds

export const useJitterBuffer = (
    ctx: AudioContext | null, 
    scheduleSignal: (state: 0 | 1, time: number) => void
) => {
    const queue = useRef<SignalEvent[]>([]);
    const timeOffset = useRef<number | null>(null);
    const lastSenderTime = useRef<number | null>(null);
    const lastScheduledTime = useRef<number>(0);
    
    // Timer to reset sync if the conversation stops
    const resyncTimer = useRef<NodeJS.Timeout | null>(null);

    const addEvent = (event: SignalEvent) => {
        if (!ctx) return;

        // 1. Initialize Sync (First Packet)
        if (timeOffset.current === null) {
            const targetTime = ctx.currentTime + (BUFFER_MS / 1000);
            timeOffset.current = targetTime - (event.timestamp / 1000);
        }
        
        queue.current.push(event);

        // 2. Critical Sort (Timestamp first, then Sequence)
        queue.current.sort((a, b) => {
            if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return (a.seq || 0) - (b.seq || 0);
        });

        // 3. Reset the Idle Timer
        if (resyncTimer.current) clearTimeout(resyncTimer.current);
        resyncTimer.current = setTimeout(() => {
            // If no data for 2 seconds, reset offset so next sentence starts fresh
            timeOffset.current = null;
            lastSenderTime.current = null;
        }, IDLE_TIMEOUT_MS);
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
                let scheduledTime = (nextEvent.timestamp / 1000) + timeOffset.current;

                // 4. Duration Preservation
                // Ensure fast dits aren't crushed by network jitter
                if (lastSenderTime.current !== null && lastScheduledTime.current > 0) {
                    const originalDuration = (nextEvent.timestamp - lastSenderTime.current) / 1000;
                    if (originalDuration > 0) {
                        // The next note cannot start earlier than (LastNote + Duration)
                        scheduledTime = Math.max(scheduledTime, lastScheduledTime.current + originalDuration);
                    }
                }

                if (scheduledTime < lookaheadTime) {
                    // 5. Schedule execution
                    // Ensure we don't error by scheduling in the past
                    const playTime = Math.max(ctx.currentTime, scheduledTime);
                    
                    scheduleSignal(nextEvent.state, playTime);
                    
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

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (resyncTimer.current) clearTimeout(resyncTimer.current);
        };
    }, [ctx, scheduleSignal]);

    return { addEvent };
};
