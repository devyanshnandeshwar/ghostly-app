import type { IUserSession } from "@shared/types/User";
import api from "./client";
import { getDeviceId } from "../utils/device";

export async function initSession(): Promise<IUserSession> {

    const deviceId = getDeviceId();

    const res = await api.post<IUserSession>("/session/init", {
        deviceId
    });

    return res.data;
}
