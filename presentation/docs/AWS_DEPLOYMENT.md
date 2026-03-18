# CMR Smart Presentation Portal - AWS Deployment Guide

## 1. Launch EC2 (Backend Host)
1. Launch Ubuntu 24.04 LTS EC2 (`t3.medium` or higher).
2. Open security group ports:
   - `22` (SSH) from your IP
   - `80` (HTTP) from `0.0.0.0/0`
   - `443` (HTTPS) from `0.0.0.0/0`
   - Do not expose app port (`5000`) publicly.
3. Attach IAM role with S3 access (`s3:PutObject`, `s3:GetObject`, `s3:ListBucket`).

## 2. Setup Node.js + Nginx on EC2
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git python3
node -v
npm -v
python3 --version
```

## 3. Deploy Backend + PM2
```bash
git clone <your-repo-url> /var/www/cmr-portal
cd /var/www/cmr-portal/backend
npm ci
cp .env.example .env
# edit .env with production values
sudo npm install -g pm2
pm2 start server.js --name cmr-backend
pm2 save
pm2 startup
```

## 4. Create RDS MySQL
1. Create Amazon RDS MySQL (Multi-AZ recommended for production).
2. Set DB subnet group + security group.
3. Allow inbound `3306` only from EC2 security group.
4. Create database and run:
   - [`backend/sql/schema.sql`](/C:/Users/manoh/Downloads/presentation/backend/sql/schema.sql)
   - optional demo users: [`backend/sql/seed_demo_users.sql`](/C:/Users/manoh/Downloads/presentation/backend/sql/seed_demo_users.sql)
   - example: `mysql -u <db_user> -p <db_name> < /var/www/cmr-portal/backend/sql/seed_demo_users.sql`

## 5. Connect Backend to RDS
1. Update EC2 backend `.env`:
   - `DB_HOST=<rds-endpoint>`
   - `DB_PORT=3306`
   - `DB_USER`, `DB_PASSWORD`, `DB_NAME`
2. Restart PM2:
```bash
cd /var/www/cmr-portal/backend
pm2 restart cmr-backend
pm2 logs cmr-backend
```

## 6. Create S3 Bucket for PPT Storage
1. Create bucket (private).
2. Enable versioning.
3. Add CORS:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": ["https://<your-frontend-domain>"],
    "ExposeHeaders": ["ETag"]
  }
]
```
Note (local dev): include `http://localhost:5173` and/or `http://localhost:5000` in `AllowedOrigins`, or set `S3_UPLOAD_MODE=proxy` on the backend to upload via the backend API (avoids browser S3 CORS).
4. Keep bucket private and use signed URLs from backend.

## 7. Configure IAM Access
1. Prefer EC2 instance role (no static keys).
2. Policy scope:
   - `s3:PutObject`
   - `s3:GetObject`
   - `s3:ListBucket`
   - optional `s3:DeleteObject` (if cleanup is needed)
3. If using keys, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in backend `.env`.
4. If using Python mailer mode, set:
   - `MAIL_PROVIDER=python`
   - `PYTHON_BIN=python3`
   - `PYTHON_MAIL_SCRIPT=scripts/send_mail.py`

## 8. Setup CloudFront CDN
1. Create CloudFront distribution with S3 origin.
2. Restrict S3 direct access using Origin Access Control (OAC).
3. Configure behavior:
   - Allowed methods: `GET, HEAD`
   - Cache policy for presentation files
4. Set `CLOUDFRONT_URL` in backend `.env`.

## 9. Configure Nginx Reverse Proxy + SSL (Let's Encrypt)
1. Create Nginx server block:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
2. Enable site and restart:
```bash
sudo ln -s /etc/nginx/sites-available/cmr-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
3. Install SSL certificate:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```
4. Verify automatic renewal:
```bash
sudo certbot renew --dry-run
```

## Frontend Deployment
1. Build frontend:
```bash
cd /var/www/cmr-portal/frontend
npm ci
npm run build
```
2. Host static build on S3 + CloudFront or on separate Nginx virtual host.
3. Set `VITE_API_BASE_URL=https://api.yourdomain.com/api`.

## Production Checklist
1. Use strong JWT secrets and SMTP credentials.
2. Enable CloudWatch logs and PM2 log rotation.
3. Restrict CORS to trusted frontend domains.
4. Regularly rotate database, SMTP, and IAM credentials.
5. Enable RDS backups and retention policies.
