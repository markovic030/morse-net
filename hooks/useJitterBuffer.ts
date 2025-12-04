import { useEffect, useRef } from 'react';
import { SignalEvent } from '../types';

// Buffer: 500ms is a safe starting point for mobile networks
const BUFFER_MS = 500; 
const LOOKAHEAD_MS = 100;

export const useJitterBuffer = (
    ctx: AudioContext | null, 
    scheduleSignal: (state: 0 | 1, time: number) => void
) => {
    const queue = useRef<SignalEvent[]>([]);
    const timeOffset = useRef<number | null>(null);
    
    // We track the Sender's time of the last processed event
    // to preserve the relative rhythm (duration between Down and Up)
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
        // Important: Sort by Sequence ID if available, else Timestamp
        // This fixes "out of order" packet arrival
        queue.current.sort((a, b) => (a.seq || a.timestamp) - (b.seq || b.timestamp));
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
                
                // Calculate ideal play time based on initial sync
                let scheduledTime = (nextEvent.timestamp / 1000) + timeOffset.current;

                // DURATION PRESERVATION LOGIC:
                // If this is a "Key Up" (0) following a "Key Down" (1),
                // we must ensure the duration is correct relative to the PREVIOUS packet.
                // If we delayed the previous packet by 0.1s due to lag, we MUST delay this one too.
                if (lastSenderTime.current !== null && lastScheduledTime.current > 0) {
                    const duration = (nextEvent.timestamp - lastSenderTime.current) / 1000;
                    // The play time must be at least (LastPlayTime + Duration)
                    // This prevents "crushing" dits if the Up packet arrives early/late
                    if (duration > 0) {
                        scheduledTime = Math.max(scheduledTime, lastScheduledTime.current + duration);
                    }
                }

                if (scheduledTime < lookaheadTime) {
                    // Safety: Never schedule in the past
                    // But if we shift it, update the offset so future notes stay in sync? 
                    // For now, just clamping it creates a small stutter but preserves the note.
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
