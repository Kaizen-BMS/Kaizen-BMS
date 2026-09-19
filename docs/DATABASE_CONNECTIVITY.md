# Database connectivity — Hostinger Remote MySQL from a dev machine

## Symptom
`Can't reach database server at srv1872.hstgr.io:3306` from Prisma (Rust query
engine), while `mysql2` (Node) and a plain TCP connect to the same host work.

## Root cause (measured 2026-09-19, not assumed)
- `srv1872.hstgr.io` has both records:
  - A    `193.203.184.226`
  - AAAA `2a02:4780:11:1234::e2` (real Hostinger IPv6)
- Local router DNS additionally synthesizes a NAT64 AAAA (`64:ff9b::c1cb:b8e2`).
- TCP to port 3306 over IPv4 succeeds; over **both** IPv6 addresses it times out
  (Hostinger's Remote MySQL / firewall is only reachable over IPv4).
- A dev machine with a global IPv6 address tries IPv6 first. Prisma's engine
  spends its whole 5 s `connect_timeout` on the dead IPv6 route and never reaches
  the IPv4 fallback. Node's `mysql2` uses happy-eyeballs, so it is unaffected.
- Proof: `?connect_timeout=60&pool_timeout=90` on the URL succeeds, after ~21 s
  (the Windows IPv6 TCP timeout, then IPv4). So the database and credentials
  are fine — only the address family is wrong.

## What is NOT the problem
Prisma, the schema, the credentials, the Remote MySQL IPv4 whitelist.

## Fixes, safest first
1. **Production (app deployed on Hostinger):** use `DB_HOST=localhost` /
   `localhost:3306` in that deployment's env. No DNS, no IPv6, no whitelist.
   Nothing to change in the code.
2. **Dev machine, recommended:** make this one hostname resolve to IPv4 only,
   outside the project. Add to `C:\Windows\System32\drivers\etc\hosts`
   (needs an Administrator editor):
   `193.203.184.226   srv1872.hstgr.io`
   Trade-off: if Hostinger ever moves the server's IP, update this line.
3. **Dev machine, alternative:** prefer IPv4 system-wide (Administrator
   PowerShell): `netsh interface ipv6 set prefixpolicy ::ffff:0:0/96 60 4`.
   Affects all applications; revert with `netsh interface ipv6 delete prefixpolicy ::ffff:0:0/96`.
4. **Infrastructure fix:** ask Hostinger support to allow Remote MySQL over IPv6
   (open 3306 on the AAAA address and whitelist the client's IPv6 range), or
   disable DNS64 on the local router. Only then would the hostname work as-is.
5. **Not recommended:** `connect_timeout=60&pool_timeout=90` in `DATABASE_URL`.
   It works, but every new connection pays ~21 s when IPv6 is dead.
6. **Not recommended:** hardcoding the IPv4 address in `.env` — it breaks
   silently when Hostinger changes IPs and hides the real cause.

`.env` was deliberately left unchanged; the working setup is untouched.
For one-off runs, override per process without editing files:
`DATABASE_URL="mysql://…@193.203.184.226:3306/db" node server.js`.
