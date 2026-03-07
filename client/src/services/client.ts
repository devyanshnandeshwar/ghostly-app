import axios from "axios";

const api = axios.create({
    // In deployment we proxy /api through nginx, so relative URLs work everywhere.
    baseURL: import.meta.env.VITE_API_URL || "/api",
});

export default api;
