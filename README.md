# Brochure

SUNG-IL smart ventilation 3D brochure (Next.js App Router).

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Sections

1. **Drive** — BLDC motor assemble, blades, then spin.
2. **Control** — SL-802B controller and SL-9001 comm module in the copy-free stage.
3. **Monitor** — Three dashboard screens sit on an invisible cylinder. A high diagonal camera shows more than one face. The cylinder dwells, then spins 120° so all three faces appear within 3 seconds. Click or tap a screen to face it and stop. Dummy captures live in `public/mock/` as uniform 1600×900 images. No live API.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm start` | Run production server |
| `npm run lint` | Lint with oxlint |

## Deploy (Vercel)

Framework preset: **Next.js**. Build command: `next build` (default). Git push to `main` or:

```bash
npx vercel --prod
```
