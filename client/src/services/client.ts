import axios from "axios";
import { getSessionToken } from "../utils/auth";

const api = axios.create({
    // Absolute in the split deployment: the SPA is on Vercel and the API on
    // Render, so there is no same-origin proxy to fall back on. The versioned
    // prefix is the contract; /api without one is only a compatibility alias
    // for clients cached before versioning existed.
    baseURL: import.meta.env.VITE_API_URL || "/api/v1",
});

// Attach the signed session token to every request so individual call sites
// don't have to remember to authenticate.
api.interceptors.request.use((config) => {
    const token = getSessionToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
