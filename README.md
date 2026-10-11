# Farmer Friendly

## Run locally

Install MySQL Server on your computer and make sure its service is running. In MySQL Workbench or a MySQL command-line client, create a database and a restricted app user (replace the password with a new one):

```sql
CREATE DATABASE farmer_friendly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'farmer_app'@'127.0.0.1' IDENTIFIED BY 'CHOOSE_A_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES
  ON farmer_friendly.* TO 'farmer_app'@'127.0.0.1';
```

Copy `.env.example` to `.env` and replace `REPLACE_WITH_PASSWORD` with that password. If it contains URL-reserved characters such as `@`, `:`, `/`, `#`, or `%`, URL-encode them (for example, `@` as `%40`). The provided URL points to MySQL on this computer at `127.0.0.1:3306`; `MYSQL_SSL=false` is appropriate for this local connection.

Install dependencies, then start both the Vite frontend and Express API:

```sh
npm install
npm run dev
```

In PowerShell, copy the template with `Copy-Item .env.example .env`, then open `.env` in VS Code. Replace the sample `SESSION_SECRET` with a unique random value. When connecting to a hosted MySQL service instead, use its connection details, set `MYSQL_SSL=true` if required, and set `MYSQL_SSL_CA` if it provides a CA certificate.

Open the local URL printed by Vite. The frontend proxies `/api` requests to the API on `http://127.0.0.1:3001`. The API checks its MySQL connection and creates the required tables and starter listings/orders on first start. Create an account from the sign-in page. Passwords must be at least 8 characters.

## API

- `GET /api/health` — API status
- `POST /api/auth/register` — create an account and sign in
- `POST /api/auth/login` — sign in
- `GET /api/auth/me` — current session
- `POST /api/auth/logout` — end the current session
- `GET /api/listings` and `POST /api/listings` — read/create crop listings
- `GET /api/orders` and `POST /api/orders` — read/place freight orders
- `GET /api/prices` — price index data
- `GET /api/weather` — weather advisory data

Authentication uses an HTTP-only, same-site cookie. Account passwords are hashed with Node's `scrypt`; sessions expire after seven days. Listing and order creation require a signed-in user. Order quantities are checked against current inventory and reduce the remaining available quantity.

The price index and weather advisory endpoints currently return the app's sample data; they are not connected to live market or weather providers.

The previous local SQLite file, if present at `server/data/farmer-friendly.sqlite`, is not modified or automatically copied into MySQL. Export/import existing accounts or user-created listings and orders separately before switching if you need to keep them.

## Production

Build the frontend with `npm run build`, then run `npm start` with `NODE_ENV=production`, `MYSQL_URL`, `MYSQL_SSL`, and a unique, long `SESSION_SECRET` environment variable. The API server serves the built frontend and API from the same origin. Set `PORT` to change the server port.
