import type { StateStorage } from 'zustand/middleware'

// NOT real encryption — the key ships in this JS bundle and is trivially recoverable by anyone who opens
// devtools, exactly like any client-side "secret" always is. This only raises the bar against a casual
// glance at localStorage: a screen share, a screenshot, a sibling poking around devtools out of
// curiosity. It is not a defense against someone who deliberately wants the password, which would need a
// server-side secret to prevent — something this app structurally can't have, since it's just you logging
// into your own IPTV provider directly, with no backend of ours in between to hold anything server-side.
const KEY = 'pedreiraflix-v1'

function xor(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length)
  return out
}

function obfuscate(input: string): string {
  const bytes = xor(new TextEncoder().encode(input))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function deobfuscate(input: string): string {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(xor(bytes))
}

/** A zustand `storage` adapter that obfuscates whatever's written to localStorage. Falls back to
 * treating the stored value as plain JSON if it doesn't decode — this is how an existing account/session
 * saved by a version of the app from before this existed keeps working, instead of silently signing
 * everyone out the first time they open the app after the update. */
export const obfuscatedStorage: StateStorage = {
  getItem: (name) => {
    const raw = localStorage.getItem(name)
    if (!raw) return null
    try {
      const decoded = deobfuscate(raw)
      JSON.parse(decoded) // throws if this wasn't actually our obfuscated format
      return decoded
    } catch {
      return raw // pre-existing plaintext from before obfuscation — read as-is, re-saved obfuscated on next write
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, obfuscate(value))
    } catch {
      // Private browsing, quota exceeded, or storage disabled — nothing we can do, and zustand's persist
      // already tolerates a failed write (the in-memory state is still correct for the rest of this tab).
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // Same as above.
    }
  },
}
