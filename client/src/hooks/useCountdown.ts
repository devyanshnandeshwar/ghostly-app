import { useState, useEffect } from 'react';

/**
 * Time remaining until the filter allowance resets, as HH:MM:SS.
 *
 * Driven by the seconds the server reports for its own rolling 24-hour window.
 * This previously counted to the viewer's local midnight, which matched a
 * backend that compared `new Date().setHours(0,0,0,0)` against
 * `lastFilterUsageDate`. Both sides have since moved to a rolling window, so
 * the number shown is now the number actually enforced -- and it no longer
 * depends on the viewer's timezone agreeing with the server's.
 */
const formatRemaining = (msRemaining: number): string => {
    if (msRemaining <= 0) return "";

    const total = Math.floor(msRemaining / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return [hours, minutes, seconds]
        .map((unit) => unit.toString().padStart(2, '0'))
        .join(':');
};

export const useCountdown = (secondsRemaining: number | undefined) => {
    // Seeded from a lazy initialiser rather than "" plus a setState in the
    // effect body: the old version showed nothing for a full second before the
    // first interval tick, and reset state from inside an effect.
    const [timeLeft, setTimeLeft] = useState(() =>
        secondsRemaining ? formatRemaining(secondsRemaining * 1000) : ""
    );

    useEffect(() => {
        if (!secondsRemaining || secondsRemaining <= 0) return;

        // Anchored to a wall-clock deadline rather than decremented per tick, so
        // a backgrounded tab that misses intervals does not drift slow.
        const deadline = Date.now() + secondsRemaining * 1000;
        setTimeLeft(formatRemaining(deadline - Date.now()));

        const interval = setInterval(() => {
            const next = formatRemaining(deadline - Date.now());
            setTimeLeft(next);
            if (!next) clearInterval(interval);
        }, 1000);

        return () => clearInterval(interval);
    }, [secondsRemaining]);

    // Derived rather than cleared through state, so there is no stale value to
    // flush when the caller stops passing a value.
    return secondsRemaining ? timeLeft : "";
};
