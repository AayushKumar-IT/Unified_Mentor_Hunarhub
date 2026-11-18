import { Router } from "express";
import { pool, rollbackTransaction } from "../db.js";
import { requireRole, requireTrustedOrigin } from "../auth.js";
import { isUuid, isValidReviewInput } from "../validation.js";
import { createNotification } from "../notifications.js";

export const transactionsRouter = Router();

transactionsRouter.post(
  "/service-requests",
  requireTrustedOrigin,
  requireRole("customer"),
  async (request, response, next) => {
    const { serviceId, requestedFor, message = "" } = request.body ?? {};
    if (!isUuid(serviceId)) {
      return response.status(400).json({
        error: { code: "INVALID_SERVICE", message: "Choose a valid service listing." }
      });
    }
    if (typeof message !== "string" || message.length > 1000) {
      return response.status(400).json({
        error: { code: "INVALID_MESSAGE", message: "Message must be 1,000 characters or fewer." }
      });
    }
    let requestedDate = null;
    if (requestedFor !== undefined && requestedFor !== null && requestedFor !== "") {
      requestedDate = new Date(requestedFor);
      if (!Number.isFinite(requestedDate.valueOf()) || requestedDate <= new Date()) {
        return response.status(400).json({
          error: { code: "INVALID_DATE", message: "Choose a future date and time." }
        });
      }
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows: services } = await client.query(
        `SELECT s.id, s.title, s.entrepreneur_id AS "entrepreneurId",
                p.user_id AS "entrepreneurUserId", s.price_amount AS price
         FROM services s
         JOIN entrepreneur_profiles p ON p.id = s.entrepreneur_id
         JOIN categories c ON c.id = p.category_id
         WHERE s.id = $1 AND s.active = TRUE AND p.active = TRUE
           AND c.active = TRUE
           AND p.verification_status = 'verified'
           AND p.availability_status = 'available'
         FOR UPDATE OF s`,
        [serviceId]
      );
      if (!services[0]) {
        if (client) await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "This service is not currently available." }
        });
      }
      const service = services[0];
      const { rows } = await client.query(
        `INSERT INTO service_requests
           (customer_id, entrepreneur_id, service_id, requested_for, customer_message, agreed_price)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, status, agreed_price AS "agreedPrice", created_at AS "createdAt"`,
        [request.user.id, service.entrepreneurId, service.id, requestedDate, message.trim(), service.price]
      );
      await client.query(
        `INSERT INTO transaction_events
           (transaction_type, transaction_id, actor_id, new_status)
         VALUES ('service_request', $1, $2, 'pending')`,
        [rows[0].id, request.user.id]
      );
      await createNotification(client, {
        userId: service.entrepreneurUserId,
        type: "service_request",
        title: "New service request",
        message: `A customer requested ${service.title ?? "your service"}.`,
        referenceType: "service_request",
        referenceId: rows[0].id
      });
      await client.query("COMMIT");
      return response.status(201).json(rows[0]);
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

transactionsRouter.post(
  "/orders",
  requireTrustedOrigin,
  requireRole("customer"),
  async (request, response, next) => {
    const { productId, quantity = 1 } = request.body ?? {};
    if (!isUuid(productId)) {
      return response.status(400).json({
        error: { code: "INVALID_PRODUCT", message: "Choose a valid product." }
      });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return response.status(400).json({
        error: { code: "INVALID_QUANTITY", message: "Quantity must be between 1 and 20." }
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows: products } = await client.query(
        `SELECT pr.id, pr.title, pr.price_amount AS price,
                pr.price_amount * $2 AS total, pr.stock_quantity AS stock,
                pr.entrepreneur_id AS "entrepreneurId",
                p.user_id AS "entrepreneurUserId"
         FROM products pr
         JOIN entrepreneur_profiles p ON p.id = pr.entrepreneur_id
         JOIN categories c ON c.id = p.category_id
         WHERE pr.id = $1 AND pr.active = TRUE AND p.active = TRUE
           AND p.verification_status = 'verified' AND c.active = TRUE
         FOR UPDATE OF pr`,
        [productId, quantity]
      );
      const product = products[0];
      if (!product || product.stock < quantity) {
        if (client) await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "INSUFFICIENT_STOCK", message: "This product is unavailable in the requested quantity." }
        });
      }

      const total = product.total;
      const { rows } = await client.query(
        `INSERT INTO orders (customer_id, entrepreneur_id, subtotal)
         VALUES ($1, $2, $3)
         RETURNING id, status, subtotal::float AS subtotal, currency, created_at AS "createdAt"`,
        [request.user.id, product.entrepreneurId, total]
      );
      const order = rows[0];
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_title, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, product.id, product.title, product.price, quantity, total]
      );
      await client.query(
        "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
        [product.id, quantity]
      );
      await client.query(
        `INSERT INTO transaction_events
           (transaction_type, transaction_id, actor_id, new_status)
         VALUES ('order', $1, $2, 'pending_confirmation')`,
        [order.id, request.user.id]
      );
      await createNotification(client, {
        userId: product.entrepreneurUserId,
        type: "order",
        title: "New product order",
        message: `A customer requested ${quantity} × ${product.title}.`,
        referenceType: "order",
        referenceId: order.id
      });
      await client.query("COMMIT");
      return response.status(201).json(order);
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

transactionsRouter.get("/my/transactions", requireRole("customer"), async (request, response, next) => {
  try {
    const [requests, orders] = await Promise.all([
      pool.query(
        `SELECT sr.id, 'service_request' AS type, sr.status, sr.agreed_price::float AS amount,
                sr.created_at AS "createdAt", p.display_name AS "entrepreneurName",
                CASE WHEN sr.status IN ('accepted', 'in_progress', 'completed')
                     THEN seller.email END AS "contactEmail",
                sr.requested_for AS "requestedFor",
                s.title AS listing,
                EXISTS (
                  SELECT 1 FROM reviews review
                  WHERE review.service_request_id = sr.id
                ) AS "hasReview"
         FROM service_requests sr
         JOIN entrepreneur_profiles p ON p.id = sr.entrepreneur_id
         LEFT JOIN users seller ON seller.id = p.user_id
         JOIN services s ON s.id = sr.service_id
         WHERE sr.customer_id = $1
         ORDER BY sr.created_at DESC`,
        [request.user.id]
      ),
      pool.query(
        `SELECT o.id, 'order' AS type, o.status, o.subtotal::float AS amount,
                o.created_at AS "createdAt", p.display_name AS "entrepreneurName",
                CASE WHEN o.status IN ('confirmed', 'ready', 'completed')
                     THEN seller.email END AS "contactEmail",
                STRING_AGG(oi.product_title || ' × ' || oi.quantity, ', ') AS listing,
                EXISTS (
                  SELECT 1 FROM reviews review
                  WHERE review.order_id = o.id
                ) AS "hasReview"
         FROM orders o
         JOIN entrepreneur_profiles p ON p.id = o.entrepreneur_id
         LEFT JOIN users seller ON seller.id = p.user_id
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.customer_id = $1
         GROUP BY o.id, p.display_name, seller.email
         ORDER BY o.created_at DESC`,
        [request.user.id]
      )
    ]);
    return response.json({
      transactions: [...requests.rows, ...orders.rows]
        .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
    });
  } catch (error) {
    return next(error);
  }
});

transactionsRouter.post(
  "/reviews",
  requireTrustedOrigin,
  requireRole("customer"),
  async (request, response, next) => {
    const { orderId, serviceRequestId, rating, reviewText = "" } = request.body ?? {};
    if (!isValidReviewInput({ orderId, serviceRequestId, rating, reviewText })) {
      return response.status(400).json({
        error: {
          code: "INVALID_REVIEW",
          message: "Choose one completed transaction, a rating from 1 to 5, and a review under 1,000 characters."
        }
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const completedTransaction = orderId
        ? await client.query(
            `SELECT o.entrepreneur_id AS "entrepreneurId", p.user_id AS "entrepreneurUserId"
             FROM orders o
             JOIN entrepreneur_profiles p ON p.id = o.entrepreneur_id
             WHERE o.id = $1 AND o.customer_id = $2 AND o.status = 'completed'`,
            [orderId, request.user.id]
          )
        : await client.query(
            `SELECT sr.entrepreneur_id AS "entrepreneurId", p.user_id AS "entrepreneurUserId"
             FROM service_requests sr
             JOIN entrepreneur_profiles p ON p.id = sr.entrepreneur_id
             WHERE sr.id = $1 AND sr.customer_id = $2 AND sr.status = 'completed'`,
            [serviceRequestId, request.user.id]
          );
      if (!completedTransaction.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({
          error: {
            code: "COMPLETED_TRANSACTION_NOT_FOUND",
            message: "Only your completed orders or service requests can be reviewed."
          }
        });
      }

      const { rows } = await client.query(
        `INSERT INTO reviews
           (entrepreneur_id, customer_id, order_id, service_request_id, rating, review_text)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, rating, review_text AS "reviewText", status`,
        [
          completedTransaction.rows[0].entrepreneurId,
          request.user.id,
          orderId ?? null,
          serviceRequestId ?? null,
          rating,
          reviewText.trim()
        ]
      );
      await createNotification(client, {
        userId: completedTransaction.rows[0].entrepreneurUserId,
        type: "review",
        title: "New customer review",
        message: "A customer left a review for your work.",
        referenceType: orderId ? "order" : "service_request",
        referenceId: orderId ?? serviceRequestId
      });
      await client.query("COMMIT");
      return response.status(201).json(rows[0]);
    } catch (error) {
      await rollbackTransaction(client);
      if (error.code === "23505") {
        return response.status(409).json({
          error: { code: "REVIEW_EXISTS", message: "You have already reviewed this completed transaction." }
        });
      }
      return next(error);
    } finally {
      client?.release();
    }
  }
);

transactionsRouter.get(
  "/entrepreneur/transactions",
  requireRole("entrepreneur"),
  async (request, response, next) => {
    try {
      const profileResult = await pool.query(
        "SELECT id FROM entrepreneur_profiles WHERE user_id = $1",
        [request.user.id]
      );
      const profile = profileResult.rows[0];
      if (!profile) {
        return response.status(409).json({
          error: { code: "PROFILE_MISSING", message: "Complete your entrepreneur profile first." }
        });
      }
      const [requests, orders] = await Promise.all([
        pool.query(
          `SELECT sr.id, sr.status, sr.agreed_price::float AS amount,
                  sr.created_at AS "createdAt", u.display_name AS "customerName",
                  CASE WHEN sr.status IN ('accepted', 'in_progress', 'completed')
                       THEN u.email END AS "contactEmail",
                  sr.requested_for AS "requestedFor",
                  s.title AS listing, sr.customer_message AS message
           FROM service_requests sr
           JOIN users u ON u.id = sr.customer_id
           JOIN services s ON s.id = sr.service_id
           WHERE sr.entrepreneur_id = $1
           ORDER BY sr.created_at DESC`,
          [profile.id]
        ),
        pool.query(
          `SELECT o.id, o.status, o.subtotal::float AS amount,
                  o.created_at AS "createdAt", u.display_name AS "customerName",
                  CASE WHEN o.status IN ('confirmed', 'ready', 'completed')
                       THEN u.email END AS "contactEmail",
                  STRING_AGG(oi.product_title || ' × ' || oi.quantity, ', ') AS listing
           FROM orders o
           JOIN users u ON u.id = o.customer_id
           JOIN order_items oi ON oi.order_id = o.id
           WHERE o.entrepreneur_id = $1
           GROUP BY o.id, u.display_name, u.email
           ORDER BY o.created_at DESC`,
          [profile.id]
        )
      ]);
      return response.json({ requests: requests.rows, orders: orders.rows });
    } catch (error) {
      return next(error);
    }
  }
);

transactionsRouter.patch(
  "/service-requests/:id/status",
  requireTrustedOrigin,
  requireRole("customer", "entrepreneur"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_REQUEST_ID", message: "Provide a valid service request ID." }
      });
    }
    const { action } = request.body ?? {};
    const transitions = request.user.role === "customer"
      ? { cancel: ["pending", "cancelled"] }
      : {
          accept: ["pending", "accepted"],
          reject: ["pending", "rejected"],
          start: ["accepted", "in_progress"],
          complete: ["in_progress", "completed"]
        };
    const transition = transitions[action];
    if (!transition) {
      return response.status(400).json({
        error: { code: "INVALID_ACTION", message: "This action is not available for your account." }
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT sr.id, sr.status, sr.customer_id AS "customerId",
                sr.entrepreneur_id AS "entrepreneurId", p.user_id AS "entrepreneurUserId"
         FROM service_requests sr
         JOIN entrepreneur_profiles p ON p.id = sr.entrepreneur_id
         WHERE sr.id = $1
         FOR UPDATE OF sr`,
        [request.params.id]
      );
      const transaction = rows[0];
      const ownsTransaction = transaction && (
        (request.user.role === "customer" && transaction.customerId === request.user.id) ||
        (request.user.role === "entrepreneur" && transaction.entrepreneurUserId === request.user.id)
      );
      if (!ownsTransaction) {
        if (client) await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "REQUEST_NOT_FOUND", message: "Service request not found." }
        });
      }
      if (transaction.status !== transition[0]) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "INVALID_STATE", message: "This service request can no longer be changed that way." }
        });
      }
      await client.query(
        "UPDATE service_requests SET status = $2, updated_at = NOW() WHERE id = $1",
        [transaction.id, transition[1]]
      );
      await client.query(
        `INSERT INTO transaction_events
           (transaction_type, transaction_id, actor_id, previous_status, new_status)
         VALUES ('service_request', $1, $2, $3, $4)`,
        [transaction.id, request.user.id, transaction.status, transition[1]]
      );
      await createNotification(client, {
        userId: request.user.role === "customer" ? transaction.entrepreneurUserId : transaction.customerId,
        type: "service_request_status",
        title: "Service request updated",
        message: `Your service request is now ${transition[1].replaceAll("_", " ")}.`,
        referenceType: "service_request",
        referenceId: transaction.id
      });
      await client.query("COMMIT");
      return response.json({ id: transaction.id, status: transition[1] });
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

transactionsRouter.patch(
  "/orders/:id/status",
  requireTrustedOrigin,
  requireRole("customer", "entrepreneur"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_ORDER_ID", message: "Provide a valid order ID." }
      });
    }
    const { action } = request.body ?? {};
    const transitions = request.user.role === "customer"
      ? { cancel: ["pending_confirmation", "cancelled"] }
      : {
          confirm: ["pending_confirmation", "confirmed"],
          reject: ["pending_confirmation", "rejected"],
          ready: ["confirmed", "ready"],
          complete: ["ready", "completed"]
        };
    const transition = transitions[action];
    if (!transition) {
      return response.status(400).json({
        error: { code: "INVALID_ACTION", message: "This action is not available for your account." }
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT o.id, o.status, o.customer_id AS "customerId",
                o.entrepreneur_id AS "entrepreneurId", p.user_id AS "entrepreneurUserId"
         FROM orders o
         JOIN entrepreneur_profiles p ON p.id = o.entrepreneur_id
         WHERE o.id = $1
         FOR UPDATE OF o`,
        [request.params.id]
      );
      const order = rows[0];
      const ownsOrder = order && (
        (request.user.role === "customer" && order.customerId === request.user.id) ||
        (request.user.role === "entrepreneur" && order.entrepreneurUserId === request.user.id)
      );
      if (!ownsOrder) {
        if (client) await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "ORDER_NOT_FOUND", message: "Order not found." }
        });
      }
      if (order.status !== transition[0]) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "INVALID_STATE", message: "This order can no longer be changed that way." }
        });
      }

      if (["cancel", "reject"].includes(action)) {
        await client.query(
          `UPDATE products p
           SET stock_quantity = p.stock_quantity + oi.quantity
           FROM order_items oi
           WHERE oi.order_id = $1 AND p.id = oi.product_id`,
          [order.id]
        );
      }
      await client.query(
        "UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1",
        [order.id, transition[1]]
      );
      await client.query(
        `INSERT INTO transaction_events
           (transaction_type, transaction_id, actor_id, previous_status, new_status)
         VALUES ('order', $1, $2, $3, $4)`,
        [order.id, request.user.id, order.status, transition[1]]
      );
      await createNotification(client, {
        userId: request.user.role === "customer" ? order.entrepreneurUserId : order.customerId,
        type: "order_status",
        title: "Product order updated",
        message: `Your product order is now ${transition[1].replaceAll("_", " ")}.`,
        referenceType: "order",
        referenceId: order.id
      });
      await client.query("COMMIT");
      return response.json({ id: order.id, status: transition[1] });
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);
