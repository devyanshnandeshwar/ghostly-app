import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as crypto from "../utils/crypto";
import { useChat } from "./useChatHook";

const transport = vi.hoisted(() => ({
  connected: true,
  listeners: new Map<string, (value: unknown) => void>(),
  on(event: string, listener: (value: unknown) => void) { this.listeners.set(event, listener); },
  off(event: string) { this.listeners.delete(event); },
  emit: vi.fn(),
}));
vi.mock("../context/SocketContext", () => ({ useSocket: () => ({ socket: transport }) }));

beforeEach(() => { transport.listeners.clear(); transport.connected = true; });
afterEach(() => vi.restoreAllMocks());

test("a key-generation failure becomes an actionable encryption error", async () => {
  vi.spyOn(crypto, "generateKeyPair").mockRejectedValueOnce(new Error("unavailable"));
  const { result } = renderHook(() => useChat("room"));
  await waitFor(() => expect(result.current.encryptionError).toMatch(/another match/i));
  expect(result.current.isEncrypted).toBe(false);
});

test("failed encryption preserves the draft and exposes a retry message", async () => {
  const remote = await crypto.generateKeyPair();
  const publicKey = await crypto.exportKey(remote.publicKey);
  const { result } = renderHook(() => useChat("room"));
  await waitFor(() => expect(transport.emit).toHaveBeenCalledWith("exchange-key", expect.anything()));
  act(() => transport.listeners.get("exchange-key")?.(publicKey));
  await waitFor(() => expect(result.current.isEncrypted).toBe(true));
  act(() => result.current.setInput("keep my draft"));
  vi.spyOn(crypto, "encryptMessage").mockRejectedValueOnce(new Error("failed"));
  await act(async () => { await result.current.sendMessage(); });
  expect(result.current.input).toBe("keep my draft");
  expect(result.current.sendError).toMatch(/try.*again/i);
  expect(result.current.messages).toEqual([]);
});
