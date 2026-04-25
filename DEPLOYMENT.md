# Deployment Guide (OMS)

## Prerequisites
- A VPS running Ubuntu 22.04+
- Docker and Docker Compose installed
- A domain name pointing to your VPS IP address (e.g., `oms.toko-optik.com`)

## 1. Setup Environment
Copy the `.env.example` in both backend and frontend to `.env` and fill them out. Note that `docker-compose.yml` injects the production variables automatically.

## 2. Start Services
Run the following from the root directory:
```bash
docker-compose up -d --build
```
This will start:
- PostgreSQL on port 5432
- Backend (Hono) on port 3000
- Frontend (Nginx/ReactRouter) on port 80

## 3. Setup SSL with Certbot (Let's Encrypt)

If you have a domain, secure it with HTTPS using Nginx and Certbot.

1. Install Certbot:
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

2. Run Certbot to automatically configure SSL for your domain:
```bash
sudo certbot --nginx -d oms.toko-optik.com
```

3. Ensure Nginx routes the frontend properly. The frontend Docker exposes port 80. You can set up a reverse proxy on the host machine's Nginx to point to the frontend Docker container.

## 4. Backups
Set up a daily cron job using the provided `backup.sh` script to dump the PostgreSQL database data safely.
```bash
crontab -e
# Add line:
0 2 * * * /root/optic-management-system/backup.sh
```
