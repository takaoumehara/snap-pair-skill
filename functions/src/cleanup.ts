import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export function buildStaleRoomDeletionUpdates(roomIds: string[]): Record<string, null> {
  const updates: Record<string, null> = {};
  for (const roomId of roomIds) {
    updates[`rooms/${roomId}`] = null;
    updates[`roomMembers/${roomId}`] = null;
  }
  return updates;
}

/**
 * Hourly cleanup job to purge expired pairing codes and stale/inactive rooms.
 * - Expires pairing codes that are past their 'expiresAt' timestamp.
 * - Expires rooms that have not been updated for over 24 hours.
 */
export const cleanupExpiredData = onSchedule("every 1 hours", async (event) => {
  const db = getDatabase();
  const now = Date.now();

  // 1. Clean up expired pairing codes
  const pairingCodesRef = db.ref("pairingCodes");
  const expiredCodesSnap = await pairingCodesRef
    .orderByChild("expiresAt")
    .endAt(now)
    .once("value");

  if (expiredCodesSnap.exists()) {
    const updates: Record<string, null> = {};
    expiredCodesSnap.forEach((child) => {
      if (child.key) {
        updates[child.key] = null;
      }
    });
    await pairingCodesRef.update(updates);
    console.log(`Successfully deleted ${Object.keys(updates).length} expired pairing codes.`);
  }

  // 2. Clean up stale/inactive rooms (e.g. no updates in the last 24 hours)
  const roomsRef = db.ref("rooms");
  const cutoffTime = now - 24 * 60 * 60 * 1000; // 24 hours threshold
  const staleRoomsSnap = await roomsRef
    .orderByChild("meta/updatedAt")
    .endAt(cutoffTime)
    .once("value");

  if (staleRoomsSnap.exists()) {
    const roomIds: string[] = [];
    staleRoomsSnap.forEach((child) => {
      if (child.key) {
        roomIds.push(child.key);
      }
    });
    const updates = buildStaleRoomDeletionUpdates(roomIds);
    await db.ref().update(updates);
    console.log(`Successfully deleted ${roomIds.length} stale rooms and memberships.`);
  }
});
