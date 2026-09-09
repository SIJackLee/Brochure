import { COMM_LCD_DETAIL_S, COMM_LCD_ON_S } from '@/lib/controller-boot';

export const COMM_LCD_WIDTH = 768;
export const COMM_LCD_HEIGHT = 360;

/** PNG UV of the dark glass, inset so the overlay stays inside the bezel. */
export const COMM_LCD_PNG_UV = {
  u0: 0.108,
  u1: 0.512,
  v0: 0.298,
  v1: 0.632,
} as const;

const BG = '#071018';
const TEXT = '#e7f2f8';
const DIM = '#8eb8c6';
const CYAN = '#5ad4e8';
const YELLOW = '#e8d24a';
const SELECT = '#1a4a9c';
const ROW = '#0c1c28';

const MENU_ITEMS = [
  'Ctrl 01-18 Comm',
  'Ctrl 19-36 Comm',
  'Ctrl 37-54 Comm',
  'ETH Setup',
  'Time Setup',
  'Ctrl Setup/Test',
  'ETH Test',
] as const;

export type CommLcdPhase = 'off' | 'menu' | 'detail';

export function commLcdPhase(elapsed: number): CommLcdPhase {
  if (elapsed < COMM_LCD_ON_S) return 'off';
  if (elapsed < COMM_LCD_DETAIL_S) return 'menu';
  return 'detail';
}

function lcdFontFamily() {
  if (typeof document === 'undefined') return '"Malgun Gothic", sans-serif';
  const named = getComputedStyle(document.documentElement).getPropertyValue('--font-noto-sans-kr').trim();
  return `${named || '"Noto Sans KR"'}, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function dummyClock(elapsed: number) {
  const total = 10 * 3600 + 55 * 60 + 51 + Math.floor(Math.max(0, elapsed));
  return {
    year: 2026,
    month: 9,
    day: 8,
    hour: Math.floor(total / 3600) % 24,
    minute: Math.floor(total / 60) % 60,
    second: total % 60,
  };
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawOff(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, COMM_LCD_WIDTH, COMM_LCD_HEIGHT);
}

function drawMenu(ctx: CanvasRenderingContext2D, elapsed: number) {
  const font = lcdFontFamily();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, COMM_LCD_WIDTH, COMM_LCD_HEIGHT);

  ctx.fillStyle = TEXT;
  ctx.font = `700 22px ${font}`;
  ctx.textAlign = 'left';
  ctx.fillText('SL-9001', 18, 32);
  ctx.textAlign = 'center';
  ctx.fillStyle = CYAN;
  ctx.fillText('< MENU >', COMM_LCD_WIDTH / 2, 32);
  ctx.textAlign = 'right';
  ctx.fillStyle = DIM;
  ctx.font = `400 20px ${font}`;
  ctx.fillText('Ver1.0', COMM_LCD_WIDTH - 18, 32);

  const rowH = 34;
  const top = 48;
  MENU_ITEMS.forEach((label, index) => {
    const y = top + index * rowH;
    if (index === 0) {
      const pulse = 0.82 + 0.18 * Math.sin(elapsed * 6);
      ctx.globalAlpha = pulse;
      fillRound(ctx, 12, y, COMM_LCD_WIDTH - 24, rowH - 4, 4, SELECT);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = index % 2 ? ROW : 'transparent';
      if (index % 2) fillRound(ctx, 12, y, COMM_LCD_WIDTH - 24, rowH - 4, 4, ROW);
      ctx.fillStyle = TEXT;
    }
    ctx.font = `700 20px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}. ${label}`, 28, y + 23);
  });

  const clock = dummyClock(elapsed);
  ctx.font = `700 18px ${font}`;
  ctx.fillStyle = CYAN;
  ctx.textAlign = 'left';
  ctx.fillText('Ethernet 8', 18, COMM_LCD_HEIGHT - 14);
  ctx.textAlign = 'center';
  ctx.fillText('Controller 04', COMM_LCD_WIDTH / 2, COMM_LCD_HEIGHT - 14);
  ctx.textAlign = 'right';
  ctx.fillStyle = YELLOW;
  ctx.fillText(
    `${clock.year}-${pad2(clock.month)}-${pad2(clock.day)} ${pad2(clock.hour)}:${pad2(clock.minute)}:${pad2(clock.second)}`,
    COMM_LCD_WIDTH - 18,
    COMM_LCD_HEIGHT - 14,
  );
}

function drawDetail(ctx: CanvasRenderingContext2D, elapsed: number) {
  const font = lcdFontFamily();
  const t = elapsed - COMM_LCD_DETAIL_S;
  const temp = 25.4 + Math.sin(t * 1.15) * 0.16;
  const vent = 34 + Math.round(Math.sin(t * 0.9) * 2);
  const clock = dummyClock(elapsed);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, COMM_LCD_WIDTH, COMM_LCD_HEIGHT);

  ctx.font = `700 18px ${font}`;
  ctx.textAlign = 'left';
  fillRound(ctx, 12, 8, 78, 28, 4, '#123044');
  ctx.fillStyle = TEXT;
  ctx.fillText('BACK', 24, 28);

  ctx.textAlign = 'center';
  ctx.font = `700 22px ${font}`;
  const title = '< CTRL 01 STATUS >';
  ctx.fillStyle = CYAN;
  ctx.fillText(title, COMM_LCD_WIDTH / 2, 30);
  const titleWidth = ctx.measureText(title).width;
  const oneWidth = ctx.measureText('01').width;
  const before01 = ctx.measureText('< CTRL ').width;
  ctx.fillStyle = YELLOW;
  ctx.fillText('01', COMM_LCD_WIDTH / 2 - titleWidth / 2 + before01 + oneWidth / 2, 30);

  ctx.textAlign = 'right';
  ctx.fillStyle = DIM;
  ctx.font = `400 16px ${font}`;
  ctx.fillText('Type P00', COMM_LCD_WIDTH - 16, 28);

  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = `400 16px ${font}`;
  ctx.fillText('Barn SP07    House 01    Rm 01', 18, 58);

  const cols = [280, 430, 580];
  ctx.fillStyle = CYAN;
  ctx.font = `700 18px ${font}`;
  ctx.textAlign = 'center';
  ['F-1', 'F-2', 'F-3'].forEach((label, i) => ctx.fillText(label, cols[i], 86));

  const rows: Array<[string, string, string, string]> = [
    ['Set T', '25.0°C', '2.0°C', '4.0°C'],
    ['T Dev', '6.0°C', '5.0°C', '5.0°C'],
    ['Min Vent', '30%', '25%', '25%'],
    ['Max Vent', '100%', '100%', '100%'],
    ['Run Vent', `${vent}%`, '0%', '0%'],
  ];

  rows.forEach((row, index) => {
    const y = 118 + index * 36;
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.font = `400 18px ${font}`;
    ctx.fillText(row[0], 18, y);
    ctx.textAlign = 'center';
    ctx.fillStyle = index === 4 ? YELLOW : TEXT;
    ctx.font = `700 20px ${font}`;
    ctx.fillText(row[1], cols[0], y);
    ctx.fillStyle = TEXT;
    ctx.fillText(row[2], cols[1], y);
    ctx.fillText(row[3], cols[2], y);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = DIM;
  ctx.font = `400 18px ${font}`;
  ctx.fillText('Meas T', 18, COMM_LCD_HEIGHT - 16);
  ctx.fillStyle = YELLOW;
  ctx.font = `700 22px ${font}`;
  ctx.fillText(`${temp.toFixed(1)}°C`, 110, COMM_LCD_HEIGHT - 16);

  ctx.textAlign = 'right';
  ctx.fillStyle = DIM;
  ctx.font = `400 18px ${font}`;
  ctx.fillText('Time', COMM_LCD_WIDTH - 168, COMM_LCD_HEIGHT - 16);
  ctx.fillStyle = CYAN;
  ctx.font = `700 18px ${font}`;
  ctx.fillText(
    `${pad2(clock.month)}-${pad2(clock.day)} ${pad2(clock.hour)}:${pad2(clock.minute)}`,
    COMM_LCD_WIDTH - 16,
    COMM_LCD_HEIGHT - 16,
  );
}

export function drawCommLcd(ctx: CanvasRenderingContext2D, elapsed: number) {
  const phase = commLcdPhase(elapsed);
  if (phase === 'off') {
    drawOff(ctx);
    return;
  }
  if (phase === 'menu') {
    drawMenu(ctx, elapsed);
    return;
  }
  drawDetail(ctx, elapsed);
}
