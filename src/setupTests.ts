import '@testing-library/jest-dom'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  length = 0
  clear() {
    this.store.clear()
    this.length = 0
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
    this.length = this.store.size
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
    this.length = this.store.size
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
})
Object.defineProperty(globalThis, 'sessionStorage', {
  value: new MemoryStorage(),
  writable: true,
})
