# Anonymous Chat — Deployment Guide

This guide helps you deploy the Anonymous Chat application to production. It covers both a simple cloud setup (Vercel + Render/Railway) and a custom VM with Nginx and HTTPS.

## Overview
- Frontend: React (Vite), served as static files
- Backend: Node.js + Express + Socket.io (WebSockets)
- Database: SQLite (file-based)
- Admin: Protected by an admin key, accessible at `/admin`

## Project Structure
- `frontend/` — web UI
- `backend/` — REST + WebSocket API

Key configs:
- Frontend dev port in `frontend/vite.config.js:6–8`
- Frontend backend URL in `frontend/.env.example:1`
- Backend env in `backend/.env.example:1–4`

## Prerequisites
- Node.js ≥ 18 and npm installed
- A domain for frontend (e.g., `app.yourdomain.com`)
- A domain for backend API (e.g., `api.yourdomain.com`)
- HTTPS termination (CDN or Nginx/Caddy)

## Environment Variables
Create real `.env` files from the examples:

- Backend `backend/.env` (see `backend/.env.example:1–4`)
  - `PORT=3000`
  - `ADMIN_SECRET=<strong-secret>`
  - `ENABLE_LOGS=true` (optional)
  - `FRONTEND_ORIGIN=https://app.yourdomain.com`

- Frontend `frontend/.env` (see `frontend/.env.example:1`)
  - `VITE_BACKEND_URL=https://api.yourdomain.com`

## Deployment Option A — Cloud (Lean and fast)

### Backend (Render/Railway)
1. Create a new Node service from the `backend/` folder.
2. Set env vars from the backend `.env` above.
3. Configure the start command: `npm start`.
4. Note your public backend URL, e.g. `https://anonychat-api.onrender.com`.

### Frontend (Vercel/Netlify)
1. Create a new project pointing to `frontend/`.
2. Set build command: `npm run build`.
3. Set output directory: `dist`.
4. Set `VITE_BACKEND_URL` to your backend URL.
5. Deploy and verify `https://your-frontend-domain`.

## Deployment Option B — Custom VM with Nginx and HTTPS

### Backend on VM
1. SSH into your VM and install Node 18+.
2. Copy the repo to the server.
3. Create `backend/.env` with production values.
4. Install and start:
   ```
   cd backend
   npm install
   npm install -g pm2
   pm2 start npm --name anonychat-api -- start
   pm2 save
   ```
5. Ensure the backend listens on `PORT` (default 3000).

### Nginx reverse proxy (WebSockets enabled)
Configure Nginx for `api.yourdomain.com`:
```
server {
  listen 443 ssl;  # certs configured via certbot or your provider
  server_name api.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
Then obtain certificates (`certbot` or your provider) and reload Nginx.

### Frontend build and serve
1. On your local machine or CI:
   ```
   cd frontend
   npm install
   echo VITE_BACKEND_URL=https://api.yourdomain.com > .env
   npm run build
   ```
2. Upload `frontend/dist/` to your static host/CDN, or serve from Nginx:
```
server {
  listen 443 ssl;
  server_name app.yourdomain.com;

  root /var/www/anonychat/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
}
```
3. Set `FRONTEND_ORIGIN=https://app.yourdomain.com` in `backend/.env`.

## Admin Usage
- Open `https://app.yourdomain.com/admin`.
- Enter your admin key and click Connect.
- Live stats, ban/unban IPs, and active rooms are available.

## Testing Checklist
- Frontend loads at your domain and the favicon is visible.
- Start Chat works between two devices.
- Admin Connect validates key and loads data.
- Ban an IP, confirm access blocked.

## Troubleshooting
- CORS: `FRONTEND_ORIGIN` must match frontend origin (with protocol).
- WebSockets: Ensure Nginx has `Upgrade`/`Connection` headers as shown.
- Ports: Confirm backend port open and not blocked by firewall.
- Env: `VITE_BACKEND_URL` must be the public API URL.
- Logs: Set `ENABLE_LOGS=true` if you need persistent chat logs.

## Maintenance
- Update with `git pull` then restart PM2:
  ```
  pm2 restart anonychat-api
  pm2 save
  ```
- Backup SQLite files (if used) regularly.

## References
- Frontend dev port: `frontend/vite.config.js:6–8`
- Frontend backend URL: `frontend/.env.example:1`
- Backend env example: `backend/.env.example:1–4`

