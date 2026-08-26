import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
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

export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid
  const cred = await signInAnonymously(auth)
  return cred.user.uid
}
