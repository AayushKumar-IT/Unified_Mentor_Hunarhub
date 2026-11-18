import { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";

export default function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const result = await apiRequest("/api/notifications");
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
    setError("");
  }

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setOpen(false);
      return undefined;
    }
    let active = true;
    const load = () => refresh().catch((loadError) => {
      if (active) setError(loadError.message);
    });
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user?.id]);

  async function markAsRead(notification) {
    if (notification.readAt) return;
    try {
      await apiRequest(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
      ));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (readError) {
      setError(readError.message);
    }
  }

  async function markAllAsRead() {
    try {
      await apiRequest("/api/notifications/read-all", { method: "POST" });
      setNotifications((current) => current.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString()
      })));
      setUnreadCount(0);
    } catch (readError) {
      setError(readError.message);
    }
  }

  if (!user) return null;

  return (
    <div className="notification-center">
      <button
        className="notification-toggle"
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">♧</span>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <div className="notification-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && <button type="button" onClick={markAllAsRead}>Mark all read</button>}
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {notifications.length ? notifications.map((notification) => (
            <button
              className={`notification-item ${notification.readAt ? "" : "unread"}`}
              key={notification.id}
              type="button"
              onClick={() => markAsRead(notification)}
            >
              <span className="notification-item-title">{notification.title}</span>
              <span className="notification-item-message">{notification.message}</span>
              <time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString()}</time>
            </button>
          )) : <p className="notification-empty">You’re all caught up.</p>}
        </section>
      )}
    </div>
  );
}
