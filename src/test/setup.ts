import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(String(key)) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(String(key));
  }

  setItem(key: string, value: string) {
    this.values.set(String(key), String(value));
  }
}

function hasUsableLocalStorage() {
  try {
    const key = '__jambox_test_storage__';
    window.localStorage.setItem(key, 'ok');
    const value = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
    return value === 'ok';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined' && !hasUsableLocalStorage()) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
}

afterEach(() => {
  if (typeof window !== 'undefined') window.localStorage.clear();
});
