import { useEffect, useRef, useCallback, useState } from 'react';
import { MORSE_TABLE, REVERSE_MORSE } from '../constants';
import { KeyerSettings } from '../types';

export const useMorseKeyer = (
    settings: KeyerSettings,
    onCharacterDecoded: (char: string) => void,
    onWordGap: () => void
) => {
    // --- Audio Engine ---
    const audioCtx = useRef<AudioContext | null>(null);
    const osc = useRef<OscillatorNode | null>(null);
    const gain = useRef<GainNode | null>(null);

    // --- State ---
    const isTransmittingRef = useRef(false);
    const [isTransmitting, setIsTransmitting] = useState(false);
    
    // Paddle State (Live)
    const leftPaddle = useRef(false);
    const rightPaddle = useRef(false);
    
    // Iambic Memory
    const nextElement = useRef<'dit' | 'dah' | null>(null);
    const lastElement = useRef<'dit' | 'dah' | null>(null);

    // Timers
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const letterTimeout = useRef<NodeJS.Timeout | null>(null);
    const wordTimeout = useRef<NodeJS.Timeout | null>(null);
    const currentCode = useRef('');

    // --- Audio Control ---
    const initAudio = useCallback(() => {
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.current.state === 'suspended') audioCtx.current.resume();

        if (!osc.current) {
            const ctx = audioCtx.current;
            osc.current = ctx.createOscillator();
            gain.current = ctx.createGain();
            
            osc.current.type = 'sine';
            osc.current.frequency.value = settings.tone;
            gain.current.gain.value = 0;
            
            osc.current.connect(gain.current);
            gain.current.connect(ctx.destination);
            osc.current.start();
        }
    }, [settings.tone]);

    // Dynamic frequency update
    useEffect(() => {
        if (osc.current && audioCtx.current) {
            osc.current.frequency.setValueAtTime(settings.tone, audioCtx.current.currentTime);
        }
    }, [settings.tone]);

    const startTone = useCallback(() => {
        if (!audioCtx.current || !gain.current) initAudio();
        const t = audioCtx.current!.currentTime;
        
        gain.current!.gain.cancelScheduledValues(t);
        gain.current!.gain.setValueAtTime(0, t);
        gain.current!.gain.linearRampToValueAtTime(settings.vol / 100, t + 0.005);
        
        isTransmittingRef.current = true;
        setIsTransmitting(true);
    }, [initAudio, settings.vol]);

    const stopTone = useCallback(() => {
        if (!audioCtx.current || !gain.current) return;
        const t = audioCtx.current.currentTime;
        
        gain.current.gain.cancelScheduledValues(t);
        gain.current.gain.setValueAtTime(gain.current.gain.value, t);
        gain.current.gain.linearRampToValueAtTime(0, t + 0.005);
        
        isTransmittingRef.current = false;
        setIsTransmitting(false);
    }, []);

    // --- Decoder Logic ---
    const handleGap = useCallback(() => {
        const unit = 1200 / settings.wpm;
        
        // Clear existing gap timers
        if (letterTimeout.current) clearTimeout(letterTimeout.current);
        if (wordTimeout.current) clearTimeout(wordTimeout.current);

        // Letter Gap (3 units)
        letterTimeout.current = setTimeout(() => {
            if (currentCode.current) {
                const char = REVERSE_MORSE[currentCode.current];
                if (char) onCharacterDecoded(char);
                currentCode.current = '';
                
                // Word Gap (7 units total = 3 already passed + 4 more)
                wordTimeout.current = setTimeout(() => {
                    onWordGap();
                }, unit * 4);
            }
        }, unit * 3); // Wait 3 units
    }, [settings.wpm, onCharacterDecoded, onWordGap]);

    // --- Iambic Engine ---
    const playElement = useCallback((type: 'dit' | 'dah') => {
        const unit = 1200 / settings.wpm;
        const duration = type === 'dit' ? unit : unit * 3;

        startTone();
        currentCode.current += (type === 'dit' ? '.' : '-');
        
        // Clear gap timers while transmitting
        if (letterTimeout.current) clearTimeout(letterTimeout.current);
        if (wordTimeout.current) clearTimeout(wordTimeout.current);

        // Schedule Tone Stop
        timerRef.current = setTimeout(() => {
            stopTone();
            lastElement.current = type;

            // Schedule Next Element Check (after 1 unit gap)
            timerRef.current = setTimeout(() => {
                checkIambicLoop();
            }, unit);

        }, duration);
    }, [settings.wpm, startTone, stopTone]);

    const checkIambicLoop = useCallback(() => {
        // 1. Check Memory (Insert)
        if (settings.mode === 'iambic-b' && nextElement.current) {
            const type = nextElement.current;
            nextElement.current = null;
            playElement(type);
            return;
        }

        // 2. Check Live Paddles
        const left = settings.polarity === 'normal' ? leftPaddle.current : rightPaddle.current;
        const right = settings.polarity === 'normal' ? rightPaddle.current : leftPaddle.current;

        if (left && right) {
            // Squeeze: Alternate
            const next = lastElement.current === 'dit' ? 'dah' : 'dit';
            playElement(next);
        } else if (left) {
            playElement('dit');
        } else if (right) {
            playElement('dah');
        } else {
            // Silence - Start Decay
            handleGap();
        }
    }, [settings.mode, settings.polarity, playElement, handleGap]);

    // --- Input Handling ---
    const setPaddle = useCallback((side: 'left' | 'right', pressed: boolean) => {
        if (!audioCtx.current) initAudio();

        if (side === 'left') leftPaddle.current = pressed;
        if (side === 'right') rightPaddle.current = pressed;

        // Straight Key Mode
        if (settings.mode === 'straight' && side === 'left') {
            if (pressed) {
                if (!isTransmittingRef.current) {
                    startTone();
                    if (letterTimeout.current) clearTimeout(letterTimeout.current);
                    if (wordTimeout.current) clearTimeout(wordTimeout.current);
                }
            } else {
                stopTone();
                // Rough decoding for straight key (based on duration) - Simplified
                // In a real app, you'd measure time here to determine dit/dah
                handleGap(); 
            }
            return;
        }

        // Iambic Mode B Memory Logic
        // If we are currently transmitting a 'dit', and the 'dah' paddle is pressed, remember it.
        if (settings.mode === 'iambic-b' && isTransmittingRef.current && pressed) {
            const isDitSide = (settings.polarity === 'normal' && side === 'left') || (settings.polarity === 'inverse' && side === 'right');
            const isDahSide = !isDitSide;
            
            if (lastElement.current === 'dit' && isDahSide) nextElement.current = 'dah';
            if (lastElement.current === 'dah' && isDitSide) nextElement.current = 'dit';
        }

        // Start Loop if idle
        if (pressed && !isTransmittingRef.current) {
            checkIambicLoop();
        }
    }, [settings.mode, settings.polarity, initAudio, startTone, stopTone, checkIambicLoop, handleGap]);

    // --- Chat Bot Playback ---
    const playString = useCallback(async (text: string) => {
        if (!audioCtx.current) initAudio();
        const unit = 1200 / settings.wpm;
        const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

        for (const char of text.toUpperCase()) {
            if (char === ' ') { await wait(unit * 7); continue; }
            const code = MORSE_TABLE[char];
            if (!code) continue;

            for (const symbol of code) {
                startTone();
                await wait(symbol === '.' ? unit : unit * 3);
                stopTone();
                await wait(unit);
            }
            await wait(unit * 3);
        }
    }, [settings.wpm, initAudio, startTone, stopTone]);

    return { setPaddle, playString, isTransmitting, stopTone };
};
