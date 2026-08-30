import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { firebaseConfig } from './firebase-config'

const useEmulator = !!import.meta.env.VITE_USE_EMULATOR

const config = useEmulator
  ? { ...firebaseConfig, projectId: 'demo-eretz', apiKey: 'demo', databaseURL: 'https://demo-eretz-default-rtdb.firebaseio.com' }
  : firebaseConfig

export const app = initializeApp(config)
export const db = getDatabase(app)
export const auth = getAuth(app)

if (useEmulator) {
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}

export function isConfigured(): boolean {
  return useEmulator || firebaseConfig.apiKey !== 'PASTE_ME'
}

export interface SignedInUser {
  uid: string
  displayName: string | null
}

export function watchUser(cb: (user: SignedInUser | null) => void): () => void {
  return onAuthStateChanged(auth, (u) =>
    cb(u ? { uid: u.uid, displayName: u.displayName } : null),
  )
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    // In-app browsers (WhatsApp/Instagram) and popup blockers can't open the
    // popup — a full-page redirect is the only flow that works there.
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
      return
    }
    throw e
  }
}

/** Surfaces errors from a signInWithRedirect round-trip; success lands via watchUser. */
export function completeRedirectSignIn(): Promise<void> {
  return getRedirectResult(auth).then(() => undefined)
}
