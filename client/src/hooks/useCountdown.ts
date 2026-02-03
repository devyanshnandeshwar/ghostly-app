import { useState, useEffect } from 'react';

export const useCountdown = (targetDate: string | Date | undefined) => {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        if (!targetDate) {
            setTimeLeft("");
            return;
        }

        const interval = setInterval(() => {
            const now = new Date().getTime();
            // const resetTime = new Date(targetDate).setHours(24, 0, 0, 0); // Next midnight relative to usage? 
            // Actually the prompt says: "Counter resets every 24 hours". 
            // In `match.socket.ts`, we check:
            // const today = new Date().setHours(0, 0, 0, 0);
            // const lastUsage = new Date(currentSession.lastFilterUsageDate || 0).setHours(0, 0, 0, 0);
            // So the reset effectively happens at midnight local server time (or UTC depending on Env).
            // Let's assume midnight relative to the user for now or calculate "tomorrow 00:00".
            
            // To be precise with the backend logic `new Date().setHours(0,0,0,0)`, the reset is technically AVAILABLE as soon as the day changes.
            // So we count down to the NEXT midnight.
            
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            
            const distance = tomorrow.getTime() - now;

            if (distance < 0) {
                clearInterval(interval);
                setTimeLeft(""); 
                // Ideally trigger a refresh here but for now just hide timer
            } else {
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);

                setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    return timeLeft;
};
