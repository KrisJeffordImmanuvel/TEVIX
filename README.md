# TEVIX — IEEE TEMS Student Chapter Web App

A small, dependency-free web application for the IEEE TEMS (Technology and
Engineering Management Society) Student Chapter.

- **Landing page:** about, what you gain, benefits table, FAQ and a join form.
- **Shared interest counter:** the "I'm interested" count is stored on the
  server, so every visitor sees the same total. Each browser can count once.
- **Membership applications:** the "Join Us" form is checked in the browser
  and again on the server, then saved. Duplicate emails are rejected.

Data is stored in PostgreSQL when `DATABASE_URL` is set (production), or in
`data/db.json` otherwise (local development, no setup needed).

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # restarts automatically when server.js changes
```

## Deploy online (free): Render + Neon

Render runs the app and Neon stores the data. Both have free plans and you can
sign in to both with GitHub.

1. **Create the database (Neon)**
   1. Sign up at <https://neon.tech> and create a project (any name, nearest region).
   2. On the project dashboard click **Connect** and copy the connection string.
      It looks like `postgresql://user:password@ep-....neon.tech/neondb?sslmode=require...`.
      The app creates its own tables on first start.
2. **Create the web service (Render)**
   1. Sign up at <https://render.com> with GitHub and allow access to this repository.
   2. Click **New → Blueprint** and pick this repository. Render reads `render.yaml`.
   3. When asked for `DATABASE_URL`, paste the Neon connection string and click **Apply**.
   4. Wait for the deploy to finish. Your site is at `https://ieee-tems-xxxx.onrender.com`,
      shown at the top of the service page. Share that link.
3. **Read applications**: in Render, open the service → **Environment** and copy
   the generated `ADMIN_TOKEN`. Then run:
   ```bash
   curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://<your-site>.onrender.com/api/applications
   ```

Every push to `main` redeploys the site automatically. On the free plan the
site sleeps after 15 minutes without visitors, so the first visit after that
takes about 30–50 seconds to load. Data is not affected because it lives in Neon.

| Variable      | Default    | Purpose                                              |
|---------------|------------|------------------------------------------------------|
| `PORT`        | `3000`     | Port to listen on                                    |
| `HOST`        | `0.0.0.0`  | Interface to bind                                    |
| `DATABASE_URL`| *(unset)*  | PostgreSQL connection string; enables Postgres storage |
| `DATA_DIR`    | `./data`   | Where `db.json` is stored when `DATABASE_URL` is unset |
| `ADMIN_TOKEN` | *(unset)*  | Turns on the endpoint that lists applications        |

## API

| Method | Path                | Description                                        |
|--------|---------------------|----------------------------------------------------|
| GET    | `/api/health`       | Health check                                       |
| GET    | `/api/interest`     | `{ "count": n }`                                   |
| POST   | `/api/interest`     | Adds one to the count and returns the new count    |
| POST   | `/api/applications` | Body: `{ name, email, year?, message? }` → `201`   |
| GET    | `/api/applications` | Lists applications (needs `Authorization: Bearer $ADMIN_TOKEN`) |

Example: read the applications you have received.

```bash
ADMIN_TOKEN=change-me npm start
curl -H "Authorization: Bearer change-me" http://localhost:3000/api/applications
```

## Project structure

```
public/
  index.html      Page markup
  css/styles.css  Swiss minimal theme
  js/app.js       Counter + form logic (talks to the API)
  favicon.svg
server.js         Static file server + JSON API
store.js          Storage: PostgreSQL or a local JSON file
render.yaml       Render deployment blueprint
```
