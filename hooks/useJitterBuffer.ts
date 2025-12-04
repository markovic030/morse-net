import { useEffect, useRef } from 'react';
import { SignalEvent } from '../types';

// How far ahead to schedule audio (100ms)
// This allows React to "freeze" for up to 100ms without glitching the audio.
const LOOKAHEAD_MS = 100;

// Network Buffer (still need this for internet jitter)
const BUFFER_MS = 500; 

export const useJitterBuffer = (
    ctx: AudioContext | null, // We now need the AudioContext to schedule time
    scheduleSignal: (state: 0 | 1, time: number) => void
) => {
    const queue = useRef<SignalEvent[]>([]);
    const timeOffset = useRef<number | null>(null);
    
    // We strictly assume the sequence is ordered (Key Down -> Key Up)
    // If we lose a packet, we might get stuck, so we need a watchdog.
    const lastScheduledTime = useRef<number>(0);

    const addEvent = (event: SignalEvent) => {
        if (!ctx) return;

        // Initialize sync if this is the first packet
        if (timeOffset.current === null) {
            // Target Audio Time = Current Audio Time + Buffer
            // We map Sender Time -> Audio Context Time
            const targetTime = ctx.currentTime + (BUFFER_MS / 1000);
            timeOffset.current = targetTime - (event.timestamp / 1000);
        }
        
        queue.current.push(event);
        queue.current.sort((a, b) => a.timestamp - b.timestamp);
    };

    useEffect(() => {
        let animationFrameId: number;

        const scheduleLoop = () => {
            if (!ctx || timeOffset.current === null) {
                animationFrameId = requestAnimationFrame(scheduleLoop);
                return;
            }

            // Look ahead window: Current Time + Lookahead
            const lookaheadTime = ctx.currentTime + (LOOKAHEAD_MS / 1000);

            // Check queue for events that fall within this window
            while (queue.current.length > 0) {
                const nextEvent = queue.current[0];
                
                // Calculate the exact second this should play
                const scheduledTime = (nextEvent.timestamp / 1000) + timeOffset.current;

                if (scheduledTime < lookaheadTime) {
                    // It is time (or almost time) to play this!
                    
                    // Safety: Don't schedule in the past if latency spiked
                    const playTime = Math.max(ctx.currentTime, scheduledTime);
                    
                    scheduleSignal(nextEvent.state, playTime);
                    lastScheduledTime.current = playTime;

                    // Remove from queue
                    queue.current.shift();
                } else {
                    // Next event is too far in the future, stop checking
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
