import type { MessageType, MessagePayloads, MessageResponse } from '../types';

/** One typed message boundary for the worker, popup, options and content runtime. */
export function send<K extends MessageType>(
  type: K,
  ...args: undefined extends MessagePayloads[K]
    ? [payload?: MessagePayloads[K]]
    : [payload: MessagePayloads[K]]
): Promise<MessageResponse<K>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'RESPONSE_TIMEOUT' }), 60000);
    try {
      chrome.runtime.sendMessage(
        { type, payload: args[0] },
        (response: MessageResponse<K> | undefined) => {
          clearTimeout(timer);
          resolve(
            chrome.runtime.lastError
              ? { ok: false, error: 'RUNTIME_UNAVAILABLE' }
              : response || { ok: false, error: 'NO_RESPONSE' }
          );
        }
      );
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, error: 'RUNTIME_UNAVAILABLE' });
    }
  });
}
