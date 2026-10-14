# TEVIX — IEEE TEMS Student Chapter Web App

A small, dependency-free web application for the IEEE TEMS (Technology and
Engineering Management Society) Student Chapter.

- **Landing page:** about, what you gain, benefits table, FAQ and a join form.
- **Shared interest counter:** the "I'm interested" count is stored on the
  server, so every visitor sees the same total. Each browser can count once.
- **Membership applications:** the "Join Us" form is checked in the browser
  and again on the server, then saved. Duplicate emails are rejected.

## Requirements

Node.js 18 or newer. There are no npm packages to install.

## Run

```bash
npm start          # http://localhost:3000
npm run dev        # restarts automatically when server.js changes
```

| Variable      | Default    | Purpose                                              |
|---------------|------------|------------------------------------------------------|
| `PORT`        | `3000`     | Port to listen on                                    |
| `HOST`        | `0.0.0.0`  | Interface to bind                                    |
| `DATA_DIR`    | `./data`   | Where `db.json` (count + applications) is stored     |
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
server.js         Static file server + JSON API with file-based storage
```
