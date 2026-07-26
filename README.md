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
