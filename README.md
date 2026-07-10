# Happy Drops Backend

Small Express/PostgreSQL backend for login and signup.

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

The server creates the first `users` table automatically on startup.
