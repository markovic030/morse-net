import { useEffect, useRef, useCallback, useState } from 'react';
import { MORSE_TABLE, REVERSE_MORSE } from '../constants';
import { KeyerSettings } from '../types';

interface InternalMorseState {
    currentCode: string;
    lastElementTime: number;
    isTransmitting: boolean;
    lastElement: string;
    iambicScheduled: boolean;
}

interface InternalPaddleState {
    ditCurrentlyPressed: boolean;
    dahCurrentlyPressed: boolean;
    ditPressedDuringElement: boolean;
    dahPressedDuringElement: boolean;
    squeezeCurrentlyPressed: boolean;
    squeezePressedDuringElement: boolean;
}

export const useMorseKeyer = (
    settings: KeyerSettings,
    onCharacterDecoded: (char: string) => void,
    onWordGap: () => void
) => {
    // Audio Context Refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);

    // State Refs (Mutable for high-freq logic)
    const morseState = useRef<InternalMorseState>({
        currentCode: '',
        lastElementTime: 0,
        isTransmitting: false,
        lastElement: '',
        iambicScheduled: false,
    });

    const paddleState = useRef<InternalPaddleState>({
        ditCurrentlyPressed: false,
        dahCurrentlyPressed: false,
        ditPressedDuringElement: false,
        dahPressedDuringElement: false,
        squeezeCurrentlyPressed: false,
        squeezePressedDuringElement: false,
    });

    // Timers
    const letterTimeoutRef = useRef<number | null>(null);
    const wordTimeoutRef = useRef<number | null>(null);
    const playbackTimeoutRef = useRef<number | null>(null);

    // Exposed visual state
    const [isTransmitting, setIsTransmitting] = useState(false);

    // --- Audio System ---
    const initAudio = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        
        // Cleanup old nodes
        if (oscRef.current) {
            try { oscRef.current.stop(); oscRef.current.disconnect(); } catch (e) {}
        }
        if (gainRef.current) {
            try { gainRef.current.disconnect(); } catch (e) {}
        }

        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();

        osc.type = 'sine';
        osc.frequency.value = settings.tone;
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.start();

        oscRef.current = osc;
        gainRef.current = gain;
    }, [settings.tone]);

    const playTone = useCallback(() => {
        setIsTransmitting(true);
        if (!audioCtxRef.current || !gainRef.current) initAudio();
        if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
        
        const now = audioCtxRef.current!.currentTime;
        gainRef.current!.gain.cancelScheduledValues(now);
        gainRef.current!.gain.setTargetAtTime(settings.vol / 100, now, 0.005);
    }, [settings.vol, initAudio]);

    const stopTone = useCallback(() => {
        setIsTransmitting(false);
        if (!audioCtxRef.current || !gainRef.current) return;
        
        const now = audioCtxRef.current.currentTime;
        gainRef.current.gain.setTargetAtTime(0, now, 0.005);
    }, []);

    // --- Timing Logic (The "Exact" Mechanics) ---
    const getTimings = useCallback(() => {
        const t_char = 1200 / settings.wpm;
        return {
            dit: t_char,
            dah: t_char * 3,
            elementGap: t_char,
            letterGap: t_char * 3,
            wordGap: t_char * 7
        };
    }, [settings.wpm]);

    const startDecayTimers = useCallback(() => {
        const t = getTimings();
        const gapThreshold = t.letterGap * 1.1;

        if (letterTimeoutRef.current) clearTimeout(letterTimeoutRef.current);
        if (wordTimeoutRef.current) clearTimeout(wordTimeoutRef.current);

        letterTimeoutRef.current = window.setTimeout(() => {
            if (morseState.current.currentCode) {
                const char = REVERSE_MORSE[morseState.current.currentCode];
                if (char) onCharacterDecoded(char);
                morseState.current.currentCode = '';

                // Word Gap Timer
                wordTimeoutRef.current = window.setTimeout(() => {
                    onWordGap();
                }, t.wordGap - gapThreshold);
            }
        }, gapThreshold);
    }, [getTimings, onCharacterDecoded, onWordGap]);

    const startIambic = useCallback(() => {
        if (morseState.current.isTransmitting) return;
        
        // Clear decay timers when transmission starts
        if (letterTimeoutRef.current) clearTimeout(letterTimeoutRef.current);
        if (wordTimeoutRef.current) clearTimeout(wordTimeoutRef.current);

        const ps = paddleState.current;
        const squeeze = ps.squeezeCurrentlyPressed || ps.squeezePressedDuringElement;
        const dit = ps.ditCurrentlyPressed || ps.ditPressedDuringElement;
        const dah = ps.dahCurrentlyPressed || ps.dahPressedDuringElement;

        let char = '';

        if (squeeze || (morseState.current.lastElement === '.' && dit && dah && settings.mode === 'iambic-b')) {
            char = (morseState.current.lastElement === '.') ? '-' : '.';
        } else if (dit) {
            char = '.';
        } else if (dah) {
            char = '-';
        } else {
            startDecayTimers();
            return;
        }

        morseState.current.isTransmitting = true;
        morseState.current.lastElement = char;

        if (settings.mode === 'iambic-a') {
            paddleState.current.ditPressedDuringElement = false;
            paddleState.current.dahPressedDuringElement = false;
        }

        const timings = getTimings();
        playTone();

        setTimeout(() => {
            stopTone();
            morseState.current.isTransmitting = false;
            morseState.current.currentCode += char;

            if (settings.mode === 'iambic-b') {
                if (char === '.') paddleState.current.ditPressedDuringElement = false;
                else paddleState.current.dahPressedDuringElement = false;
            }

            morseState.current.iambicScheduled = true;
            setTimeout(() => {
                morseState.current.iambicScheduled = false;
                startIambic();
            }, timings.elementGap);
        }, char === '.' ? timings.dit : timings.dah);

    }, [settings.mode, getTimings, playTone, stopTone, startDecayTimers]);

    const handleStraightKey = useCallback((down: boolean) => {
        const now = performance.now();
        const timings = getTimings();

        if (down) {
            if (letterTimeoutRef.current) clearTimeout(letterTimeoutRef.current);
            if (wordTimeoutRef.current) clearTimeout(wordTimeoutRef.current);

            if (!morseState.current.isTransmitting) {
                morseState.current.isTransmitting = true;
                morseState.current.lastElementTime = now;
                playTone();
            }
        } else {
            if (morseState.current.isTransmitting) {
                morseState.current.isTransmitting = false;
                stopTone();
                const dur = now - morseState.current.lastElementTime;
                morseState.current.currentCode += (dur < (timings.dit + timings.dah) / 2) ? '.' : '-';
                morseState.current.lastElementTime = now;
                startDecayTimers();
            }
        }
    }, [getTimings, playTone, stopTone, startDecayTimers]);

    // --- Input Handlers ---
    const setPaddle = useCallback((side: 'left' | 'right', pressed: boolean) => {
        // Init audio context on first user interaction
        if (!audioCtxRef.current) initAudio();

        if (settings.mode === 'straight' && side === 'left') {
            handleStraightKey(pressed);
            return;
        }

        const isDitSide = (settings.polarity === 'normal' && side === 'left') || (settings.polarity === 'inverse' && side === 'right');
        
        // Update Current State
        if (pressed) {
            if (isDitSide) paddleState.current.ditCurrentlyPressed = true;
            else paddleState.current.dahCurrentlyPressed = true;
        } else {
            if (isDitSide) paddleState.current.ditCurrentlyPressed = false;
            else paddleState.current.dahCurrentlyPressed = false;
        }

        // Memory Logic (Type Ahead)
        if (pressed && (morseState.current.isTransmitting || morseState.current.iambicScheduled)) {
             if (isDitSide) paddleState.current.ditPressedDuringElement = true;
             else paddleState.current.dahPressedDuringElement = true;
        }

        paddleState.current.squeezeCurrentlyPressed = paddleState.current.ditCurrentlyPressed && paddleState.current.dahCurrentlyPressed;

        if (pressed && !morseState.current.isTransmitting && !morseState.current.iambicScheduled) {
            startIambic();
        }
    }, [settings.mode, settings.polarity, initAudio, handleStraightKey, startIambic]);


    // --- Playback Logic (For Chat Bot) ---
    const playString = async (text: string) => {
        if (!audioCtxRef.current) initAudio();
        
        // Stop any existing playback
        if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
        
        const wait = (ms: number) => new Promise(r => {
             playbackTimeoutRef.current = window.setTimeout(r, ms);
        });

        const timings = getTimings();
        
        for (const char of text.toUpperCase()) {
            const code = MORSE_TABLE[char];
            if (!code) {
                if (char === ' ') await wait(timings.wordGap);
                continue;
            }

            for (let i = 0; i < code.length; i++) {
                const symbol = code[i];
                playTone();
                await wait(symbol === '.' ? timings.dit : timings.dah);
                stopTone();
                if (i < code.length - 1) await wait(timings.elementGap);
            }
            await wait(timings.letterGap);
        }
    };

    return {
        setPaddle,
        playString,
        isTransmitting,
        stopTone // Exposed for cleanup
    };
};