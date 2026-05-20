# LNL3D Quote System

A self-contained 3D printing quote management system. Runs locally via Docker.

**URL:** [http://localhost:3000](http://localhost:3000)

---

## Starting the Site

### First time (or after a code change)

Docker Desktop must be running before any of the commands below work.

```sh
cd ~/Documents/Claude_Projects/LNL3D_QuotingSite

# Build the image and start the container
docker compose build && docker compose up -d
```

### Normal start (no code changes)

```sh
cd ~/Documents/Claude_Projects/LNL3D_QuotingSite

docker compose up -d
```

### If Docker Desktop isn't open yet

Open Docker Desktop from your Applications folder (or Spotlight → "Docker"), wait ~10 seconds for the daemon to start, then run `docker compose up -d`.

---

## Stopping the Site

```sh
docker compose down
```

Your quotes, customers, and settings are **never deleted** by stopping or rebuilding — they live in the `data/` folder which is mounted as a volume outside the container.

---

## Checking Status

```sh
# Is the container running?
docker ps

# View live logs (useful for debugging)
docker logs -f lnl3d-quotes
```

---

## After Editing the HTML File

Because `LNL3D_Quote.html` is baked into the Docker image (not volume-mounted), **any edit to the HTML requires a rebuild**:

```sh
docker compose build && docker compose up -d
```

Then hard-refresh your browser (`Cmd + Shift + R`) to clear the cached JS/CSS.

> **Why?** The `Dockerfile` copies the HTML at build time (`COPY LNL3D_Quote.html ./`). Only the `data/` folder is live-mounted, so settings/quotes persist across rebuilds automatically.

---

## File Reference

| File | Purpose |
|------|---------|
| `LNL3D_Quote.html` | Entire app — HTML, CSS, and JS in one file |
| `server.js` | Tiny Node.js HTTP server; serves the HTML and stores data via JSON files |
| `docker-compose.yml` | Defines the container, port mapping (`3000:3000`), and the `data/` volume mount |
| `Dockerfile` | Builds the image from `node:20-alpine`, copies app files |
| `data/quotes.json` | All logged quotes (persists across rebuilds) |
| `data/customers.json` | Customer list |
| `data/settings.json` | Shop rates, printers, materials, tax rate |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect to Docker daemon` | Open Docker Desktop and wait for it to fully start |
| Changes not showing in browser | Run `docker compose build && docker compose up -d`, then `Cmd+Shift+R` in the browser |
| Port 3000 already in use | `docker compose down` then `docker compose up -d`, or check if another process is on port 3000 |
| Data seems reset | Check that `data/` exists in the project folder — it must not be inside `.dockerignore` |
