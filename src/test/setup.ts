import "@testing-library/jest-dom";

declare const Buffer: { from(data: Uint8Array): { toString(encoding: string): string } } | undefined;

// Polyfill btoa for Unicode strings (jsdom's btoa fails on non-Latin1 chars)
// Only replace if the native one is broken
try {
  btoa("测试");
} catch {
  globalThis.btoa = (str: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Use Node's Buffer to do actual base64 if available
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
    // Fallback: manual base64 encoding
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b1 = bytes[i], b2 = bytes[i + 1] ?? 0, b3 = bytes[i + 2] ?? 0;
      result += chars[b1 >> 2];
      result += chars[((b1 & 3) << 4) | (b2 >> 4)];
      result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : "=";
      result += i + 2 < bytes.length ? chars[b3 & 63] : "=";
    }
    return result;
  };
}

// Mock crypto.subtle.digest for SHA-256 in tests
// jsdom doesn't implement Web Crypto fully
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: {
        digest: async (_algorithm: string, _data: Uint8Array) => {
          // Return a simple mock hash buffer
          const mockHash = new Uint8Array(32).fill(0xab);
          return mockHash.buffer;
        },
      },
      randomUUID: () => "00000000-0000-0000-0000-000000000001",
      getRandomValues: <T extends Uint8Array>(arr: T): T => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
    } as any,
  });
}
