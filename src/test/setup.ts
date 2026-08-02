import "@testing-library/jest-dom/vitest";
import {cleanup} from "@testing-library/react";
import {afterEach} from "vitest";
import {resetApiSecurityState, setCsrfToken} from "../lib/api";

const storage = new Map<string, string>();
const testLocalStorage: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => {
    storage.delete(key);
  },
  setItem: (key, value) => {
    storage.set(String(key), String(value));
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testLocalStorage,
});

// Component tests run below the application-level SessionProvider. Seed the
// token it normally obtains during bootstrap so unrelated request mocks remain
// focused on the component endpoint they exercise.
setCsrfToken("test-csrf-token");

afterEach(() => {
  cleanup();
  testLocalStorage.clear();
  resetApiSecurityState();
  setCsrfToken("test-csrf-token");
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
