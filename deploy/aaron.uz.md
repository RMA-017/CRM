# `aaron.uz` Production Deploy

## Target layout

- frontend: `https://aaron.uz`
- api: `https://aaron.uz/api/*` via Nginx reverse proxy to `127.0.0.1:3003`
- process manager: `pm2`
- TLS: `certbot` + `nginx`

## 1. Server packages

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22
fnm default 22
npm install -g pnpm pm2
```

## 2. Project paths

```bash
sudo mkdir -p /var/www/aaron-crm
sudo chown -R $USER:$USER /var/www/aaron-crm
git clone <your-repo-url> /var/www/aaron-crm
cd /var/www/aaron-crm
```

## 3. API env

Set `api/.env` for production:

```env
NODE_ENV=production
PORT=3003
WEB_ORIGIN=https://aaron.uz,https://www.aaron.uz
COOKIE_SECURE=true
TRUST_PROXY=true

PG_HOST=...
PG_PORT=5432
PG_USER=...
PG_PASSWORD=...
PG_DBNAME=...

JWT_SECRET=change-this
DEFAULT_CREATED_USER_PASSWORD=change-this
```

Important:

- keep `PM2_INSTANCES=1` for the first production test
- this repo now defaults to `1` instance if `PM2_INSTANCES` is not set

## 4. Install and build

```bash
cd /var/www/aaron-crm/api
pnpm install
pnpm migrate

cd /var/www/aaron-crm/web
pnpm install
pnpm build
```

## 5. Nginx

```bash
sudo cp /var/www/aaron-crm/deploy/nginx/aaron.uz.conf /etc/nginx/sites-available/aaron.uz
sudo ln -sf /etc/nginx/sites-available/aaron.uz /etc/nginx/sites-enabled/aaron.uz
sudo nginx -t
sudo systemctl reload nginx
```

## 6. HTTPS certificate

Point `A` records first:

- `aaron.uz` -> your server IP
- `www.aaron.uz` -> your server IP

Then run:

```bash
sudo certbot --nginx -d aaron.uz -d www.aaron.uz
```

## 7. Start API

```bash
cd /var/www/aaron-crm/api
PM2_INSTANCES=1 pnpm pm2:start
pm2 save
pm2 startup
```

## 8. Health checks

```bash
curl -I https://aaron.uz
curl https://aaron.uz/health
curl https://aaron.uz/ready
```

## Notes

- frontend now prefers same-origin `/api` in production, so Nginx reverse proxy is the intended setup
- `web/public/runtime-config.js` exists if you later want to override API base without rebuilding
