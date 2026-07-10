# NeuralTrade (NT) VPS Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy NeuralTrade (Go backend + Next.js frontend) to VPS via GitHub Actions CI/CD with Docker, using GitHub Container Registry (GHCR) for image builds.

**Architecture:** GitHub Actions builds Docker images (frontend & backend) and pushes to GHCR. VPS pulls images via SSH and runs via Docker Compose. Nginx reverse proxy handles domain routing and SSL via Let's Encrypt. Neon PostgreSQL is the external DB.

**Tech Stack:** Docker, GitHub Actions, GHCR, Nginx, Let's Encrypt (certbot), GitHub Container Registry

## Global Constraints

- Domain: `nt.navisha.cloud`
- VPS IP: `103.139.193.21`
- VPS user: `ahmadhafizh` (non-root, has sudo)
- Deploy path: `/opt/navisha-trade`
- GitHub repo: `https://github.com/jhontea/nt`
- DB: Neon PostgreSQL (external, no local DB container)
- Frontend port: `3100` (mapped to host `127.0.0.1:3100`)
- Backend port: `8100` (mapped to host `127.0.0.1:8100`)
- Existing containers use: 3000, 3010, 3020, 3050, 8010, 8020, 8090, 8100, 8888, 9200
- **Port 3100 and 8100 are free** — no conflicts
- Build happens on GitHub (not on VPS) to keep VPS lightweight
- Images stored on GHCR, VPS only pulls and runs

## Port Allocation (VPS)

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| NT Frontend | 3100 | 3100 |
| NT Backend | 8100 | 8100 |

> 3100 is new, 8100 is already in use by existing NT? Check if this is a fresh deploy or replacement. Since the repo has no running container listed for 3100/8100 in the docker ps output, these ports are available.

---

### Task 1: Prepare GitHub Repository Secrets

**Files:** None (GitHub UI configuration)

- [ ] **Step 1: Go to GitHub repo Settings > Secrets and variables > Actions**

- [ ] **Step 2: Add the following repository secrets:**

| Secret Name | Value |
|-------------|-------|
| `VPS_HOST` | `103.139.193.21` |
| `VPS_USERNAME` | `root` (or your SSH user) |
| `VPS_SSH_KEY` | Private SSH key for VPS (the full `-----BEGIN OPENSSH PRIVATE KEY-----` ... `-----END OPENSSH PRIVATE KEY-----`) |
| `VPS_SSH_PORT` | `22` (or your SSH port) |

- [ ] **Step 3: Verify GHCR access**

Ensure the GitHub Actions bot (or your PAT) can push to GHCR. For public repos, no extra config needed. For private repos, the default `GITHUB_TOKEN` has `write:packages` scope automatically.

---

### Task 2: Create backend `.env` on VPS

**Files:** Create on VPS at `/opt/navisha-trade/backend/.env`

> **SECURITY:** This file contains real secrets. Never commit it to git. Create it manually on the VPS only.

- [ ] **Step 1: SSH into VPS and create project directory**

```bash
ssh ahmadhafizh@103.139.193.21
sudo mkdir -p /opt/navisha-trade/backend
sudo chown -R ahmadhafizh:ahmadhafizh /opt/navisha-trade
```

- [ ] **Step 2: Create backend environment file**

The backend uses individual DB vars (not `DATABASE_URL`). Parse your Neon connection string into the fields below.

Neon URL format: `postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>/<DB_NAME>?sslmode=require`

```bash
cat > /opt/navisha-trade/backend/.env << 'EOF'
PORT=8100
JWT_SECRET=<generate: openssl rand -hex 32>
TOKEN_EXPIRY_HOURS=24
TOKO_API_KEY=<your TokoCrypto API key>
TOKO_SECRET_KEY=<your TokoCrypto secret key>
TELEGRAM_BOT_TOKEN=<your Telegram bot token>
TELEGRAM_CHAT_ID=<your Telegram chat ID>

# Neon PostgreSQL — parse from your Neon connection string
DB_HOST=<neon-pooler-hostname>
DB_PORT=5432
DB_NAME=<neon-db-name>
DB_USER=<neon-db-user>
DB_PASSWORD=<neon-db-password>
DB_SSLMODE=require
DB_MAX_CONNECTIONS=25
DB_MAX_IDLE_CONNECTIONS=5

ALLOWED_ORIGINS=https://nt.navisha.cloud
GOOGLE_CLIENT_ID=<optional>
GOOGLE_CLIENT_SECRET=<optional>
GOOGLE_REDIRECT_URL=https://nt.navisha.cloud/v1/auth/google/callback
ALLOWED_EMAILS=<comma-separated email whitelist, optional>
EOF
```

- [ ] **Step 3: Secure the file permissions**

```bash
chmod 600 /opt/navisha-trade/backend/.env
```

> Generate JWT_SECRET with: `openssl rand -hex 32`

---

### Task 3: Create `docker-compose.prod.yml` on VPS

**Files:** Create on VPS at `/opt/navisha-trade/docker-compose.yml`

- [ ] **Step 1: Create docker-compose file**

```bash
cat > /opt/navisha-trade/docker-compose.yml << 'EOF'
services:
  backend:
    image: ghcr.io/jhontea/nt-backend:latest
    container_name: nt-backend
    ports:
      - "127.0.0.1:8100:8100"
    env_file: ./backend/.env
    # ponytail: .env loaded from /opt/navisha-trade/backend/.env on VPS
    restart: unless-stopped

  frontend:
    image: ghcr.io/jhontea/nt-frontend:latest
    container_name: nt-frontend
    ports:
      - "127.0.0.1:3100:3100"
    environment:
      - NEXT_PUBLIC_API_URL=https://nt.navisha.cloud/api
      - NEXT_PUBLIC_WS_URL=wss://nt.navisha.cloud/ws
    depends_on:
      - backend
    restart: unless-stopped
EOF
```

> Frontend uses `wss://` and `https://` because Nginx will terminate SSL and proxy to the backend.

---

### Task 4: Configure Nginx Reverse Proxy + SSL

**Files:** Create on VPS at `/etc/nginx/sites-available/nt`

- [ ] **Step 1: Install Nginx and certbot if not already installed**

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

- [ ] **Step 2: Create Nginx site config**

```bash
sudo tee /etc/nginx/sites-available/nt << 'EOF'
server {
    server_name nt.navisha.cloud;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API — strip /api prefix before proxying to backend
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        rewrite ^/ws(.*) /ws$1 break;
        proxy_pass http://127.0.0.1:8100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
EOF
```

- [ ] **Step 3: Enable site and test Nginx config**

```bash
sudo ln -sf /etc/nginx/sites-available/nt /etc/nginx/sites-enabled/nt
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] **Step 4: Get SSL certificate**

```bash
sudo certbot --nginx -d nt.navisha.cloud --non-interactive --agree-tos --email your-email@example.com
```

> Certbot will modify the Nginx config to add SSL automatically.

- [ ] **Step 5: Verify certbot auto-renewal**

```bash
sudo systemctl status certbot.timer
```

---

### Task 5: Create GitHub Actions Workflow for CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Build & Deploy to VPS

on:
  push:
    branches: [master]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ghcr.io/${{ github.repository }}-backend
  FRONTEND_IMAGE: ghcr.io/${{ github.repository }}-frontend

jobs:
  build-backend:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile.backend
          push: true
          tags: |
            ${{ env.BACKEND_IMAGE }}:latest
            ${{ env.BACKEND_IMAGE }}:${{ github.sha }}

  build-frontend:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push frontend image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile.frontend
          push: true
          tags: |
            ${{ env.FRONTEND_IMAGE }}:latest
            ${{ env.FRONTEND_IMAGE }}:${{ github.sha }}

  deploy:
    needs: [build-backend, build-frontend]
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USERNAME }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_SSH_PORT }}
          script: |
            cd /opt/navisha-trade

            echo "Pulling latest images..."
            docker pull ghcr.io/jhontea/nt-backend:latest
            docker pull ghcr.io/jhontea/nt-frontend:latest

            echo "Restarting containers..."
            docker compose up -d --force-recreate

            echo "Cleaning up old images..."
            docker image prune -f

            echo "Deployment complete!"
```

- [ ] **Step 2: Commit and push workflow**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add deploy workflow for VPS via GHCR"
git push origin master
```

---

### Task 6: Adjust Dockerfile.frontend Port

**Files:**
- Modify: `Dockerfile.frontend`

- [ ] **Step 1: Update frontend Dockerfile to expose and use port 3100**

The current `Dockerfile.frontend` already uses `EXPOSE 3100` and `npm start -p 3100`. No change needed — verified from codebase exploration.

> **Skip this task if already correct.** The Dockerfile.frontend already uses port 3100 as expected.

---

### Task 7: Update Frontend to Use Production API URLs

**Files:**
- Modify: `frontend/next.config.ts` (if needed)
- Modify: Frontend source files that hardcode API URLs

- [ ] **Step 1: Verify how frontend reads API URL**

The frontend uses environment variables:
- `NEXT_PUBLIC_API_URL` — set in docker-compose to `https://nt.navisha.cloud/api`
- `NEXT_PUBLIC_WS_URL` — set in docker-compose to `wss://nt.navisha.cloud/ws`

These are injected at container runtime via docker-compose. No code change needed if the frontend reads these env vars correctly. Verify in frontend source.

- [ ] **Step 2: If API URL is hardcoded, update to use env var**

Search frontend source for `localhost:8100` or `localhost:3100` and replace with the env var reads.

---

### Task 8: Adjust Backend CORS / Allowed Origins

**Files:**
- Modify on VPS: `/opt/navisha-trade/backend/.env`

- [ ] **Step 1: Ensure backend `.env` on VPS includes production origins**

```
ALLOWED_ORIGINS=https://nt.navisha.cloud
```

Already set in Task 2. Verify backend code reads `ALLOWED_ORIGINS` env var for CORS.

---

### Task 9: Initial VPS Setup and First Deployment

**Files:** None (manual steps on VPS)

- [ ] **Step 1: SSH into VPS**

```bash
ssh root@103.139.193.21
```

- [ ] **Step 2: Install Docker if not already installed**

```bash
apt update
apt install -y docker.io docker-compose-plugin
systemctl enable docker
systemctl start docker
```

- [ ] **Step 3: Authenticate GHCR on VPS (for pulling private images)**

```bash
# Use a GitHub PAT with read:packages scope
echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

> Skip if the repo is public. For private repos, a PAT is required.

- [ ] **Step 4: Run docker compose manually for the first time**

```bash
cd /opt/navisha-trade
docker compose up -d
docker compose logs -f  # check logs, Ctrl+C to exit
```

- [ ] **Step 5: Verify containers are running**

```bash
docker ps | grep nt-
```

Expected:
```
nt-frontend   ...   127.0.0.1:3100->3100/tcp
nt-backend    ...   127.0.0.1:8100->8100/tcp
```

- [ ] **Step 6: Verify site is accessible**

Open `https://nt.navisha.cloud` in browser. Should load the frontend and be able to hit the backend API.

---

### Task 10: Verify End-to-End

- [ ] **Step 1: Push a change to `master` branch**

```bash
git commit --allow-empty -m "chore: trigger deployment test"
git push origin master
```

- [ ] **Step 2: Go to GitHub > Actions tab and watch the workflow run**

Three jobs should run: `build-backend`, `build-frontend`, `deploy`

- [ ] **Step 3: Verify on VPS that new containers are up**

```bash
ssh root@103.139.193.21 "docker ps | grep nt-"
```

- [ ] **Step 4: Open `https://nt.navisha.cloud` and verify it works**

---

## Summary

| Step | Where | What |
|------|-------|------|
| 1 | GitHub UI | Add VPS secrets |
| 2 | VPS `/opt/navisha-trade/backend/.env` | Backend env vars (individual DB_HOST/PORT/NAME/USER/PASSWORD/SSLMODE) |
| 3 | VPS `/opt/navisha-trade/docker-compose.yml` | Production docker-compose |
| 4 | VPS Nginx | Reverse proxy + SSL for `nt.navisha.cloud` |
| 5 | Repo `.github/workflows/deploy.yml` | GitHub Actions CI/CD |
| 6 | Check | Frontend port already 3100 |
| 7 | Check | Frontend uses env vars for API URL |
| 8 | Check | Backend CORS allows production domain |
| 9 | VPS | First manual deploy + verify |
| 10 | Repo + VPS | Push to trigger CI/CD end-to-end |
