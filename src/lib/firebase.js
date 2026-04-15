// src/lib/firebase.js
//
// Firebase Realtime Database setup.
// Provides helper functions for creating, joining, and updating
// mediation rooms with real-time listeners.

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
} from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── Room helpers ──────────────────────────────────────────

/** Create a new room with initial state */
export async function createRoom(code) {
  const roomRef = ref(db, `rooms/${code}`);
  await set(roomRef, {
    roles: { plaintiff: false, defendant: false },
    messages: [],
    processing: false,
    created: new Date().toISOString(),
  });
}

/** Fetch current room snapshot (one-time read) */
export async function getRoom(code) {
  const snapshot = await get(ref(db, `rooms/${code}`));
  return snapshot.exists() ? snapshot.val() : null;
}

/** Subscribe to room changes — returns unsubscribe function */
export function onRoomChange(code, callback) {
  const roomRef = ref(db, `rooms/${code}`);
  return onValue(roomRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

/** Claim a role in the room */
export async function claimRole(code, roleId) {
  const room = await getRoom(code);
  if (!room) throw new Error("Room not found");
  if (room.roles[roleId]) throw new Error("Role already taken");
  await update(ref(db, `rooms/${code}/roles`), { [roleId]: true });
}

/** Add a message to the room */
export async function addMessage(code, sender, content) {
  const room = await getRoom(code);
  if (!room) throw new Error("Room not found");
  const messages = room.messages || [];
  messages.push({
    id: Date.now(),
    sender,
    content,
    ts: new Date().toISOString(),
  });
  await update(ref(db, `rooms/${code}`), { messages });
}

/** Set the processing flag (prevents double-sends) */
export async function setProcessing(code, value) {
  await update(ref(db, `rooms/${code}`), { processing: value });
}

/** Reset a room to initial state */
export async function resetRoom(code) {
  await set(ref(db, `rooms/${code}`), {
    roles: { plaintiff: false, defendant: false },
    messages: [],
    processing: false,
    created: new Date().toISOString(),
  });
}
