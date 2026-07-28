# Happy Drops Backend

Express/PostgreSQL backend for Happy Drops accounts, commerce, workshops,
suppliers, wellness assessments, and the Knowledge Hub.

## Setup

1. Create a PostgreSQL database named `happy_drops`.
2. Copy `.env.example` to `.env`.
3. Update `DATABASE_URL` and `JWT_SECRET`.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Start the backend:

   ```bash
   npm run dev
   ```

The server automatically applies pending SQL files from `migrations/` on startup.
Each migration runs in a transaction and is recorded in `schema_migrations`.
Never edit an already-applied migration; add a new numbered migration instead.

The migration runner recognizes the existing Happy Drops schema as its baseline,
so it does not recreate those tables or touch their data. Always back up a
production database before applying migrations.

## Commands

- `npm run dev` — development server
- `npm start` — production server
- `npm run check` — syntax-check all backend modules
- `npm run db:migrate` — apply pending migrations
- `npm run test:smoke` — exercise the live API configured by `API_BASE_URL`

## API coverage

- `/api/auth` — signup, login, logout, current user, profile and password reset
- `/api/products`, `/api/categories`, `/api/articles` — storefront catalog/content
- `/api/cart` — guest or authenticated persistent carts
- `/api/orders` — transactional checkout, history and secure tracking
- `/api/workshops` — listings, capacity-aware bookings and custom requests
- `/api/assessments` — wellness submissions and customer history
- `/api/knowledge` — customer questions and personalized recipes
- `/api/suppliers`, `/api/contact`, `/api/newsletter` — public submissions
- `/api/account` — addresses, favorites and booking history
- `/api/admin` — staff order, supplier, knowledge and inventory workflows

Checkout records payments with `PENDING` status through the manual provider.
Production charging requires a payment provider adapter and webhook credentials;
card details must never be sent to or stored by this API.

`FRONTEND_ORIGIN` accepts a comma-separated list of allowed browser origins.
Set `PUBLIC_URL`, `FRONTEND_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`, and
`NODE_ENV=production` in the deployed environment.
