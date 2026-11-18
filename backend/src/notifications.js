export async function createNotification(client, {
  userId,
  type,
  title,
  message,
  referenceType,
  referenceId
}) {
  if (!userId) return;
  await client.query(
    `INSERT INTO notifications
       (user_id, notification_type, title, message, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, title, message, referenceType ?? null, referenceId ?? null]
  );
}
