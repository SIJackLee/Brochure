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
3. **Monitor** — Three function cards (Field, Chart, Model) sit in a top-left to bottom-right deck. Click or tap brings one card forward. Dummy captures live in `public/mock/` as uniform 1600×900 images. No live API.

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
