# @thrift/server — optional own server

A small [Hono](https://hono.dev) app for the extension's **"Eigener Server"** mode. It holds the OpenRouter key, so the computer and the iPhone don't need one. It also serves the form map (for hot fixes), a remote kill switch, and monthly usage counts for all devices.

The extension works without it ("Eigener API-Key" mode). Add the server only when you want it.

## What is stored

- **Photos and listing text are never stored or logged.** They are processed in memory for one request and then dropped.
- The only thing written to disk is `data/usage.json`: request, token and cost counts per month and per device (token index). Design V6 said SQLite. A JSON file is enough for two devices and needs no native module.

## API

All paths come from `API_PATHS` in `packages/shared/src/protocol.ts`. Every route except `/v1/health` needs `Authorization: Bearer <token>`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/v1/health` | `{ ok: true }` (no auth) |
| GET | `/v1/config` | `{ autofillEnabled, formMapVersion }` |
| GET | `/v1/form-map` | `{ formMap }` |
| GET | `/v1/usage` | `{ month, inputTokens, outputTokens, costEur }`, summed over all devices for the current month |
| POST | `/v1/analyze`, `/v1/rewrite`, `/v1/choose`, `/v1/pick-element` | `{ result, usage }` |

Errors are JSON `{ error, kind? }`:

- `401` unauthorized
- `400` `bad_request` (body fails the shared schema)
- `413` `too_large` (body over 15 MB)
- `502` with the AI error kind (`invalid_output`, `refusal`, `truncated`, `request`)

CORS only allows `chrome-extension://…` and `safari-web-extension://…` origins.

## Configuration (`.env`)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes* | | Used for both models. |
| `ANTHROPIC_API_KEY` | * | | Only if you don't use OpenRouter (then both jobs use `MODEL`). *One of the two keys is required. |
| `THRIFT_TOKENS` | yes | | Comma-separated, one per device, each at least 24 chars. The position in the list is the device id for usage counts, so add new tokens at the end. |
| `AUTOFILL_ENABLED` | no | `true` | Kill switch. With `false`, the extensions stop filling. |
| `MODEL` | no | `anthropic/claude-haiku-5.5` | Photos & text. |
| `NAV_MODEL` | no | `typesafe/jev-router` | Choosing options and finding fields. |
| `FORM_MAP_PATH` | no | built-in map | A JSON file validated against the shared `FormMap` schema. Put it in `data/` and use `/app/data/form-map.json`. |
| `PORT` | no | `8787` | |
| `DOMAIN` | compose only | | Used by Caddy. |
| `DATA_DIR` | no | `./data` | Set to `/app/data` in the container. |

The server exits at startup with a clear message if anything is missing or invalid. Restart it after changing `.env` or the form map file: `docker compose up -d`.

## Local development

```sh
pnpm install                              # at the repo root
cd server
OPENROUTER_API_KEY=sk-or-... THRIFT_TOKENS=$(openssl rand -hex 24) pnpm dev
pnpm test && pnpm typecheck && pnpm build # build writes the self-contained bundle dist/main.js
```

## Deploy on an Oracle Cloud VM (Always Free, ARM64 Ampere or x86)

The images are multi-arch (`node:22-slim`, `caddy:2`), and the server bundle is plain JavaScript, so ARM64 works as is.

### 1. Open ports 80 and 443

Caddy needs both: port 80 for the Let's Encrypt challenge and port 443 for HTTPS.

**a) VCN security list** (Oracle Cloud console):

1. Go to Networking → Virtual Cloud Networks → your VCN → Subnet → Security List → *Add Ingress Rules*.
2. Add two rules, each with source CIDR `0.0.0.0/0`, protocol TCP, and destination ports `80` and `443`.
3. Optional: add UDP 443 for HTTP/3.

**b) The OS firewall on the VM**, which Oracle images ship with:

- **Ubuntu** (iptables rules in `/etc/iptables/rules.v4`):
  ```sh
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```
- **Oracle Linux** (firewalld):
  ```sh
  sudo firewall-cmd --permanent --add-service=http --add-service=https
  sudo firewall-cmd --reload
  ```

### 2. Domain

Point a domain's **A record** at the VM's public IP. If you have no domain, use a free [DuckDNS](https://www.duckdns.org) subdomain such as `myshop.duckdns.org` and set its IP there.

Check it with `dig +short myshop.duckdns.org`.

### 3. Install Docker

Follow the official guide for [Ubuntu](https://docs.docker.com/engine/install/ubuntu/) or for Oracle Linux (use the [RHEL/CentOS](https://docs.docker.com/engine/install/centos/) repo). Make sure the Compose plugin is installed so that `docker compose version` works.

### 4. Configure and start

```sh
git clone <this repo> thrift_shop_publisher
cd thrift_shop_publisher/server
cp .env.example .env
openssl rand -hex 24      # run once per device (computer, iPhone) and put the results in THRIFT_TOKENS
nano .env                 # set DOMAIN, OPENROUTER_API_KEY, THRIFT_TOKENS
mkdir -p data && sudo chown 1000:1000 data   # the container runs as the non-root user "node" (uid 1000)
docker compose up -d --build
docker compose logs -f    # look for "listening on :8787" and Caddy obtaining the certificate
```

`docker compose` builds the image with the **repo root** as context (`context: ..`), because the server bundles `packages/shared`. To build by hand, run this from the repo root:

```sh
docker build -f server/Dockerfile -t thrift-server .
```

### 5. Verify

```sh
D=https://myshop.duckdns.org
T=<one of your tokens>
curl $D/v1/health                                   # {"ok":true}
curl -i $D/v1/form-map                              # 401 {"error":"unauthorized"}
curl -H "Authorization: Bearer $T" $D/v1/form-map   # {"formMap":{...}}
curl -H "Authorization: Bearer $T" $D/v1/config     # {"autofillEnabled":true,"formMapVersion":"..."}
curl -H "Authorization: Bearer $T" $D/v1/usage      # this month's tokens and cost
```

### 6. Update

```sh
git pull && docker compose up -d --build
```

## Set up the extension (server mode)

On each device, open the extension settings (on the iPhone, in the container app):

1. Choose **"Eigener Server"**.
2. Enter the server URL, e.g. `https://myshop.duckdns.org`, and **that device's** token.
3. Tap **"Verbindung testen"**. It calls `/v1/config`.

No OpenRouter key is stored on the device in this mode.

To switch filling off everywhere, set `AUTOFILL_ENABLED=false` and run `docker compose up -d`. To lock out a lost device, remove its token. That shifts the device ids of the tokens after it in the usage counts.
