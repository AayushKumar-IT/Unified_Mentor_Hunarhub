import { Router } from "express";
import { pool } from "../db.js";
import { requireRole, requireTrustedOrigin } from "../auth.js";
import { isUuid } from "../validation.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/notifications",
  requireRole("customer", "entrepreneur", "admin"),
  async (request, response, next) => {
    try {
      const [notifications, unread] = await Promise.all([
        pool.query(
        `SELECT id, notification_type AS type, title, message,
                reference_type AS "referenceType", reference_id AS "referenceId",
                read_at AS "readAt", created_at AS "createdAt"
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [request.user.id]
        ),
        pool.query(
          "SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL",
          [request.user.id]
        )
      ]);
      return response.json({
        notifications: notifications.rows,
        unreadCount: unread.rows[0].total
      });
    } catch (error) {
      return next(error);
    }
  }
);

notificationsRouter.patch(
  "/notifications/:id/read",
  requireTrustedOrigin,
  requireRole("customer", "entrepreneur", "admin"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_NOTIFICATION_ID", message: "Provide a valid notification ID." }
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
         WHERE id = $1 AND user_id = $2
         RETURNING id, read_at AS "readAt"`,
        [request.params.id, request.user.id]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification not found." }
        });
      }
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

notificationsRouter.post(
  "/notifications/read-all",
  requireTrustedOrigin,
  requireRole("customer", "entrepreneur", "admin"),
  async (request, response, next) => {
    try {
      const { rowCount } = await pool.query(
        "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
        [request.user.id]
      );
      return response.json({ updated: rowCount });
    } catch (error) {
      return next(error);
    }
  }
);
