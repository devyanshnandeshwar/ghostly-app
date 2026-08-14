import axios from "axios";
import { getSessionToken } from "../utils/auth";

const api = axios.create({
    // In deployment we proxy /api through nginx, so relative URLs work everywhere.
    baseURL: import.meta.env.VITE_API_URL || "/api",
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
