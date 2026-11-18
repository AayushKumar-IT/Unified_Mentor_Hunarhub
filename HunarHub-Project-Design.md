# HunarHub — Digital Marketplace for Local Micro-Entrepreneurs

## 1. Product vision

HunarHub is a responsive marketplace that helps customers discover trusted local
entrepreneurs, request in-person services, and buy handmade products. It gives
entrepreneurs straightforward tools to present their work and manage incoming
requests without requiring advanced digital skills. Administrators verify
entrepreneurs and keep marketplace content and activity safe and reliable.

**Product principle:** make the next useful action obvious for each role, with
mobile-first screens, plain language, and transparent prices and statuses.

## 2. Goals and success measures

### Product goals

- Help customers find relevant local skills and products by category and
  location.
- Let customers place service requests and product orders with clear prices,
  availability, and status tracking.
- Let entrepreneurs manage a profile, offerings, availability, and requests
  from a simple dashboard.
- Give administrators tools to verify entrepreneurs, manage categories, and
  respond to complaints.

### KPIs

| KPI | Definition |
|---|---|
| Registered entrepreneurs | Count of entrepreneur accounts, also segmented by verification and active status |
| Active customers | Unique customer accounts with a session or marketplace action during the reporting period |
| Request conversion | Service requests accepted ÷ service requests submitted |
| Product sales volume | Count and gross value of orders, reported separately by order status |
| Average entrepreneur earnings | Completed order and service value attributable to entrepreneurs ÷ earning entrepreneurs |
| Customer satisfaction | Average published review rating, with review count shown alongside it |

Report the date range and denominator for every rate or average. Do not count
cancelled or rejected transactions as completed sales.

## 3. Roles and permissions

| Role | Capabilities |
|---|---|
| Visitor | Browse verified profiles, services, and products; search and filter; view public ratings |
| Customer | Visitor capabilities plus manage account, submit/cancel eligible requests, place/cancel eligible orders, view own history, and submit reviews for completed activity |
| Entrepreneur | Manage own profile, services, products, availability, and incoming requests/orders; accept or reject requests; view own activity and earnings summary |
| Administrator | Review entrepreneur applications, manage categories/skills, review complaints, moderate listings/reviews, monitor transactions, and view platform reports |

Authorization is enforced by the backend on every protected operation. An
entrepreneur can only modify their own records; customers can only view and
change their own requests, orders, and reviews. Administrative permissions are
granted explicitly, not inferred from a public profile field.

## 4. Scope

### MVP

- Responsive customer marketplace with category, location, and price filters.
- Entrepreneur registration, profile setup, verification state, and dashboard.
- Service and product listings with pricing and image uploads.
- Service request and product order lifecycle tracking.
- Availability controls and customer order/request history.
- Reviews after completed interactions.
- Admin review queue, category management, complaint handling, and basic KPI
  reporting.
- Email or in-app status notifications; notification delivery failures are
  visible to operators and do not silently change transaction state.

### Not in MVP

- Native mobile applications, international shipping, AI recommendations,
  logistics/delivery management, digital wallets, and automated payouts.
- Real-time chat, auctions, complex promotions, and multi-vendor cart checkout.

### MVP assumptions

- Launch in one defined service area and one currency, INR (₹), with explicit
  locale and currency configuration so expansion does not require hard-coded
  display logic.
- Customers coordinate service details and fulfillment directly with the
  entrepreneur; the platform records the request and its status.
- Product orders are order intents until a payment provider is integrated.
  Do not display an order as paid or completed based only on its creation.
- Admin verification is manual in the MVP.

## 5. Information architecture and screens

### Public marketplace

1. **Home:** search entry, category shortcuts, nearby verified entrepreneurs,
   featured products, and a clear “Become a seller” entry point.
2. **Browse:** category and result count, search, filters for skill/category,
   location, and price, plus sorting by relevance or price. On mobile, filters
   open in a compact sheet and remain visible as removable chips when applied.
3. **Entrepreneur profile:** name, verification status, service area, skills,
   experience, availability summary, services and prices, product gallery,
   ratings, and separate “Request service” / “View product” actions.
4. **Product detail:** images, title, description, price, seller, availability,
   and order action.
5. **Sign in / registration:** role-aware onboarding; avoid asking customers
   for seller details before they choose to become an entrepreneur.

### Customer account

- **My activity:** tabs for service requests and product orders, each with
  status, date, seller, and next available action.
- **Request/order detail:** transaction summary, status timeline, relevant
  contact/coordination instructions, and cancellation action when permitted.
- **Review form:** rating and optional written feedback, available only for
  eligible completed activity.

### Entrepreneur dashboard

- **Overview:** pending actions, new requests, active orders, listing status,
  and a date-ranged earnings summary.
- **Profile editor:** name/business name, biography, category/skills,
  experience, location/service area, contact preferences, and profile image.
- **Services:** create/edit/archive service, price or “starting at” price,
  duration/description, and availability.
- **Products:** create/edit/archive product, images, price, stock/availability,
  and description.
- **Requests and orders:** queue with status filters, detail, and permitted
  accept/reject/status actions.
- **Availability:** simple available/unavailable toggle and optional working
  hours or unavailable dates.

### Admin console

- **Verification queue:** application details, submitted evidence references,
  approve/reject with reason, and audit history.
- **Marketplace management:** categories and skills, listing moderation, and
  reported content.
- **Transactions:** searchable requests and orders with status and complaint
  context; administrative actions are audited.
- **Complaints:** open/in-progress/resolved state, assigned admin, notes, and
  outcome.
- **Analytics:** date filters, KPI definitions, status breakdowns, and
  downloadable report only if authorized.

## 6. Core workflows and state transitions

### Entrepreneur onboarding

1. User creates an account and chooses “Offer services or products.”
2. Entrepreneur completes profile and submits it for review.
3. Application moves from `draft` to `pending_review`.
4. Admin approves or rejects with a reason. Approval enables public discovery;
   rejection returns a correctable application to `needs_changes`.
5. Entrepreneur edits and resubmits; changes to sensitive identity details
   may return the profile to review.

Verification status is separate from account status and listing status.
Unverified profiles must not appear as verified search results.

### Service request

1. Customer chooses a listed service, provides requested date/time, location
   or meeting preference, and an optional message.
2. The platform validates that the service is active and the entrepreneur is
   available, then creates a `pending` request.
3. Entrepreneur accepts or rejects. Acceptance records the agreed price and
   response timestamp; rejection requires no customer action.
4. Accepted requests may become `in_progress`, then `completed`; customer or
   entrepreneur may cancel only under the defined cancellation rules.
5. A review is permitted only after completion.

Valid transitions:

`pending -> accepted | rejected | cancelled`

`accepted -> in_progress | cancelled`

`in_progress -> completed | cancelled`

Terminal states: `rejected`, `cancelled`, `completed`.

### Product order

1. Customer selects quantity and submits an order intent.
2. Server checks listing availability and reserves/decrements stock
   transactionally to prevent overselling.
3. Order starts as `pending_confirmation` (or `confirmed` if the seller
   accepts automatically); the product seller confirms or rejects.
4. Seller records fulfillment as `ready` and then `completed` after handoff.
   The MVP does not claim payment or delivery tracking.
5. Cancellation/restock behavior is applied consistently and recorded in the
   order history.

Valid transitions:

`pending_confirmation -> confirmed | rejected | cancelled`

`confirmed -> ready | cancelled`

`ready -> completed | cancelled`

Terminal states: `rejected`, `cancelled`, `completed`.

For both workflows, accept/reject and stock operations must be atomic and
idempotent. A repeated submission must not create duplicate transactions.
Record actor, timestamp, and prior/new state for every transition.

## 7. Domain model

Use PostgreSQL with UUID primary keys, foreign keys, check constraints, and
timestamps stored in UTC. Use soft archival (`archived_at`) for listings that
must disappear from discovery while remaining in historical transactions.

| Entity | Important fields and relationships |
|---|---|
| `users` | `id`, normalized unique `email` or phone, `password_hash` or external auth reference, `role`, `status`, `created_at`, `updated_at` |
| `entrepreneur_profiles` | `id`, unique `user_id`, `display_name`, `bio`, `experience_years`, `location_id`, `service_area`, `verification_status`, `availability_status`, `created_at`, `updated_at` |
| `categories` | `id`, `name`, `slug`, `parent_id` nullable, `active` |
| `skills` | `id`, `category_id`, `name`, `active` |
| `entrepreneur_skills` | `entrepreneur_id`, `skill_id`; unique pair |
| `services` | `id`, `entrepreneur_id`, `category_id`, `title`, `description`, `price_amount`, `price_type`, `duration_minutes`, `active`, `archived_at` |
| `products` | `id`, `entrepreneur_id`, `category_id`, `title`, `description`, `price_amount`, `currency`, `stock_quantity`, `active`, `archived_at` |
| `media_assets` | `id`, `owner_id`, `storage_key`, `content_type`, `size_bytes`, `moderation_status`, `created_at`; store object references, not binary files in database rows |
| `listing_media` | `media_asset_id`, `listing_type`, `listing_id`, `sort_order` |
| `service_requests` | `id`, `customer_id`, `entrepreneur_id`, `service_id`, requested slot, customer message, agreed price, `status`, timestamps |
| `orders` | `id`, `customer_id`, `entrepreneur_id`, `status`, currency, subtotal, timestamps |
| `order_items` | `id`, `order_id`, `product_id`, title/price snapshot, quantity, line total |
| `reviews` | `id`, `customer_id`, `entrepreneur_id`, optional `order_id` or `service_request_id`, rating 1–5, text, moderation status; one review per eligible transaction |
| `complaints` | `id`, `reporter_id`, optional transaction reference, subject, description, status, assigned admin, resolution |
| `transaction_events` | `id`, transaction type/id, actor id, prior state, new state, note, `created_at` |
| `notifications` | `id`, `user_id`, type, payload, read timestamp, delivery state |

Additional indexes:

- Unique normalized user contact identifier.
- B-tree indexes on listing owner/category/active and transaction
  customer/entrepreneur/status/created time.
- Appropriate location index for the launch geography; start with indexed
  locality/pincode fields, and add geospatial search only when its scope is
  defined.
- Unique review constraint per transaction and customer.

Store monetary amounts as integer minor units (paise), with currency code.
Snapshot product title and unit price into order items so historical orders
remain accurate after listing edits.

## 8. API design

Version REST endpoints under `/api/v1`. Return consistent JSON errors with
HTTP status, stable error code, safe message, and optional field-level
validation errors. Paginate collection endpoints with bounded page size and
stable ordering.

### Discovery and accounts

- `GET /categories`
- `GET /entrepreneurs?category=&skill=&location=&minPrice=&maxPrice=&sort=&page=`
- `GET /entrepreneurs/{id}`
- `GET /products?category=&location=&minPrice=&maxPrice=&page=`
- `GET /products/{id}`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- `GET /me`, `PATCH /me`

### Entrepreneur

- `POST /entrepreneur/application`
- `PATCH /entrepreneur/profile`
- `POST /entrepreneur/services`, `PATCH /entrepreneur/services/{id}`,
  `DELETE /entrepreneur/services/{id}`
- `POST /entrepreneur/products`, `PATCH /entrepreneur/products/{id}`,
  `DELETE /entrepreneur/products/{id}`
- `PATCH /entrepreneur/availability`
- `GET /entrepreneur/requests`, `POST /entrepreneur/requests/{id}/accept`,
  `POST /entrepreneur/requests/{id}/reject`
- `GET /entrepreneur/orders`, `POST /entrepreneur/orders/{id}/confirm`,
  `POST /entrepreneur/orders/{id}/status`
- `GET /entrepreneur/earnings?from=&to=`

### Customer

- `POST /service-requests`, `GET /service-requests?mine=true`,
  `GET /service-requests/{id}`, `POST /service-requests/{id}/cancel`
- `POST /orders`, `GET /orders?mine=true`, `GET /orders/{id}`,
  `POST /orders/{id}/cancel`
- `POST /reviews`, `GET /entrepreneurs/{id}/reviews`

### Administration

- `GET /admin/verifications`, `POST /admin/verifications/{id}/approve`,
  `POST /admin/verifications/{id}/reject`
- CRUD `/admin/categories` and `/admin/skills`
- `GET /admin/transactions`, `GET /admin/complaints`,
  `PATCH /admin/complaints/{id}`
- `GET /admin/reports/summary?from=&to=`

The specific auth mechanism, contact verification, and notification provider
are deployment decisions. Keep authentication behind middleware and avoid
exposing provider credentials or internal error details in API responses.

## 9. Suggested technical architecture

### Stack

- **Frontend:** React with TypeScript; Next.js is a good fit for server-rendered
  public marketplace pages and discoverability. Use accessible HTML and a
  small shared design system.
- **Backend:** Node.js with Express and TypeScript, organized into routes,
  validation, authorization, services, and data-access modules.
- **Database:** PostgreSQL, with migrations checked into source control.
- **Image storage:** private-by-default object storage with generated
  time-limited upload/download URLs and server-side validation.
- **Deployment:** deploy frontend and API as separately scalable services;
  managed PostgreSQL and object storage are preferred. Keep local, staging,
  and production configuration separate.

### Request path

Browser -> frontend -> REST API -> authorization/validation -> domain service
-> PostgreSQL. The API issues or verifies short-lived media upload URLs. A
notification worker or provider sends status messages after the database
transaction commits.

Keep business rules (ownership checks, transitions, stock, price snapshots)
in the server domain layer, not in browser-only logic. Use database
transactions for multi-record updates and transactional outbox or retryable
jobs for notifications.

### Performance and reliability

- Set a measurable target: p95 API response under 500 ms for ordinary
  marketplace reads under expected launch load; largest public pages should
  become usable within the stated <3-second page-load goal on a representative
  mobile connection.
- Use pagination, appropriate indexes, image resizing/compression, lazy
  loading, and caching for public category/listing reads.
- Protect concurrent booking and stock operations with database transactions
  and row-level locking or equivalent conditional updates.
- Add health/readiness checks, structured logs with request IDs, error
  monitoring, database backups, and a documented restore procedure.
- Use graceful handling of provider outages; do not fabricate successful
  messages or transaction statuses.

## 10. Security, privacy, and accessibility

- Use a proven authentication library/provider; hash passwords with a
  current password-hashing algorithm if managed authentication is not used.
- Secure cookies with `HttpOnly`, `Secure`, and suitable `SameSite` settings
  for cookie sessions; add CSRF protection where applicable. Apply rate
  limiting to authentication, upload, and write endpoints.
- Validate and normalize all inputs server-side; use parameterized database
  queries and output encoding. Enforce object-level authorization for every
  user-owned resource to prevent IDOR.
- Store secrets in deployment secret management, never in the client bundle or
  repository. Minimize personal data and define retention and deletion
  processes.
- Restrict image type and size, inspect actual content rather than trusting
  filename or browser MIME type, and prevent public execution of uploaded
  content.
- Keep an audit trail for admin decisions and status changes. Do not log
  passwords, auth tokens, or unnecessary personal data.
- Meet WCAG 2.1 AA as a target: keyboard operation, visible focus, semantic
  headings and labels, sufficient contrast, text alternatives for images,
  and understandable validation/error messages.
- Obtain consent and publish privacy, terms, seller rules, cancellation, and
  complaint policies appropriate to the launch jurisdiction before going live.

## 11. Visual and interaction direction

- Warm, community-oriented visual identity that celebrates craft without
  making the interface feel informal or untrustworthy.
- Use real entrepreneur and product imagery where available; provide
  intentional placeholders and never imply verification when it is pending.
- Keep primary actions prominent, prices and service areas easy to scan, and
  transaction status visible as text (not color alone).
- Use responsive cards on browse pages and a single-column detail layout on
  small screens. Forms should be short, grouped into clear steps, and save
  recoverable drafts.
- Provide loading, empty, error, offline/retry, and success states on every
  core workflow.
- Use plain, translatable labels; do not rely on English-only iconography.

## 12. Acceptance criteria

1. A visitor can browse verified entrepreneurs and products without an
   account, and filter by category, location, and price.
2. A customer can register, submit a service request, see its status and
   history, and cancel it only in eligible states.
3. A customer can place an order for an available product; simultaneous orders
   cannot oversell the available stock.
4. An entrepreneur can edit only their own profile and listings, manage
   availability, and accept or reject incoming requests.
5. Unverified entrepreneurs are clearly labeled or excluded according to the
   discovery policy and cannot be represented as verified.
6. Customers can review only their own completed order or service request, at
   most once per transaction.
7. An administrator can approve/reject an application with a reason, manage
   categories, and update complaint status; each action is auditable.
8. Every order/request status change is validated against the state machine
   and persisted with actor and timestamp.
9. Core screens work at mobile and desktop widths, are keyboard operable, and
   expose validation and transaction status accessibly.
10. Public browse performance meets the agreed page-load target in a
    repeatable test environment; concurrent order tests show no duplicate
    orders from retries and no stock overselling.

## 13. Test strategy

- **Unit tests:** price calculations, validation, permission policies, and
  state-transition rules.
- **Integration tests:** API and database ownership checks, verification
  gating, order stock transactions, duplicate submissions, and review
  eligibility.
- **End-to-end tests:** customer discovery-to-request/order journeys;
  entrepreneur onboarding and request management; admin verification and
  complaint handling.
- **Accessibility tests:** automated checks plus keyboard and screen-reader
  review of core flows.
- **Performance tests:** representative browse and concurrent order/request
  traffic; measure page-load and API latency against stated thresholds.
- **Operational tests:** backup restore, notification retry behavior, and
  health-check behavior.

## 14. Delivery sequence

1. **Foundation:** confirm launch geography and policies, design system,
   authentication, database migrations, role authorization, and deployment
   environments.
2. **Marketplace:** categories, entrepreneur onboarding/profile, services,
   products, media, discovery, and filters.
3. **Transactions:** service requests, product orders, state histories,
   concurrency safeguards, and customer/entrepreneur dashboards.
4. **Trust and operations:** reviews, verification admin, complaints,
   reporting, audit logs, and notifications.
5. **Release readiness:** accessibility, security review, performance tests,
   backup/restore, content review, and production monitoring.

## 15. Decisions to confirm before implementation

- Launch city/region and whether location search uses locality/pincode or
  distance.
- Whether customer contact is email, phone, or both, and the required
  verification method.
- Whether product orders require seller confirmation or are automatically
  confirmed when stock is reserved.
- Cancellation policy and what counts as completion for service and product
  transactions.
- Which verification evidence is collected and how it is retained.
- Whether the MVP uses in-app notifications, email, SMS, or a combination.
- Legal, privacy, tax, and consumer-protection requirements for the launch
  jurisdiction.
