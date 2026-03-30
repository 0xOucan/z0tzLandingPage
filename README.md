# Z0tz Landing Page + Relayer

Landing page and integrated relayer for [Z0tz](https://github.com/0xOucan/Z0tz) — FHE-Native Private Wallet Stack.

A single Vercel deployment that serves both the marketing site and the UserOp relayer.

## Features

### Landing Page
- Interactive CLI terminal simulator
- Verified contract links (9 contracts x 3 chains)
- Testnet transaction links (36/36 demo)
- Fhenix ecosystem market fit section
- "Coming Soon" modal for GUI launch
- Z0tz design system (void black, bone white, blood red)

### Relayer API
- `POST /api/relay` — Submit signed UserOps to EntryPoint
- `POST /api/bridge` — Cross-chain lock-and-mint relay
- `GET /api/health` — Relayer status
- `GET /api/config` — Contract addresses (public)

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in RELAYER_PRIVATE_KEY and contract addresses
npm run dev
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|----------|-------------|
| `RELAYER_PRIVATE_KEY` | Private key that funds gas for UserOps |
| `PAYMASTER_ADDRESS_<chainId>` | Z0tzPaymaster per chain |
| `FACTORY_ADDRESS_<chainId>` | Z0tzAccountFactory per chain |
| `BRIDGE_ADDRESS_<chainId>` | Z0tzBridge per chain |

## Vercel Deployment

1. Import this repo on Vercel
2. Add all env vars from `.env.example` to Vercel environment settings
3. Deploy — landing page + relayer ready

Then in the Z0tz CLI, set the relayer URL:
```bash
# Use the Vercel-deployed relayer
z0tz init --relayer https://your-deployment.vercel.app
```

## Tech Stack

- Next.js 16 + Tailwind CSS
- IBM Plex Mono font
- Viem for blockchain interactions
- No external UI frameworks

## Related

- [Z0tz](https://github.com/0xOucan/Z0tz) — Main repo (contracts, CLI, specs)
- [Z0tzRelayer](https://github.com/0xOucan/Z0tzRelayer) — Standalone relayer

## License

Apache-2.0
