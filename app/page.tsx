'use client';

import FanScene, { type ShotMode } from '@/components/fan-scene';
import { useState } from 'react';

const flowSteps = [
  'Sense climate',
  'SL-802B control',
  'BLDC ventilation',
  'Cloud sync',
  'Dashboard insight',
];

export default function Home() {
  const [shotMode, setShotMode] = useState<ShotMode>('cinematic');
  const [chapterProgress, setChapterProgress] = useState(0);

  const selectShot = (mode: ShotMode) => {
    setShotMode(mode);
    if (mode === 'chapters') setChapterProgress(0);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#dfece5] text-[#17241d]">
      <div className="absolute inset-0">
        <FanScene
          mode={shotMode}
          chapterProgress={chapterProgress}
          onChapterWheel={(deltaY) =>
            setChapterProgress((progress) =>
              Math.min(1, Math.max(0, progress + deltaY * 0.0012)),
            )
          }
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(238,245,240,0.96)_0%,rgba(238,245,240,0.78)_31%,rgba(238,245,240,0.08)_58%,rgba(238,245,240,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(0deg,rgba(238,245,240,0.9)_0%,rgba(238,245,240,0)_100%)]" />

      <section className="pointer-events-none relative z-10 flex min-h-screen select-none flex-col justify-between px-6 py-7 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#0f8d4b] text-sm font-black text-white">
              SI
            </span>
            <span className="text-sm font-semibold tracking-[0.18em] text-[#0f8d4b]">
              SUNG-IL
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#b8cec1] bg-[#eef5f0]/70 p-1.5 shadow-[0_10px_28px_rgba(41,83,62,0.08)] backdrop-blur-md">
            {([
              ['cinematic', 'Cinematic'],
              ['chapters', 'Scroll chapters'],
              ['focus', 'Interactive focus'],
            ] as const).map(([mode, label], index) => (
              <button
                key={mode}
                type="button"
                aria-pressed={shotMode === mode}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  shotMode === mode
                    ? 'bg-[#0f8d4b] text-white shadow-sm'
                    : 'text-[#4d6b5b] hover:bg-[#dcebe1]'
                }`}
                onClick={() => selectShot(mode)}
              >
                <span className="mr-1 text-[10px] opacity-70">0{index + 1}</span>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="max-w-2xl pb-12 pt-24 sm:pt-28 lg:pb-20">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-[#0f8d4b]">
            QR brochure concept
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[0.95] text-[#132019] sm:text-7xl lg:text-8xl">
            Control the Climate
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#486457] sm:text-xl sm:leading-9">
            Sense the environment, adjust ventilation, and connect field data
            from windowless pig houses to the cloud dashboard.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              className="pointer-events-auto select-none rounded-full bg-[#0f8d4b] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(15,141,75,0.26)]"
              href="https://autofankorea.com/"
            >
              Homepage
            </a>
            <a
              className="pointer-events-auto select-none rounded-full border border-[#9fbaaa] bg-[#eef5f0]/62 px-5 py-3 text-sm font-semibold text-[#254736] backdrop-blur-md"
              href="https://smart.autofankorea.com/"
            >
              Dashboard
            </a>
          </div>
        </div>

        <ol className="grid gap-2 text-sm text-[#516f61] sm:grid-cols-5">
          {flowSteps.map((step, index) => (
            <li
              className="flex min-h-12 items-center gap-3 rounded-lg border border-[#c9dbd0] bg-[#eef5f0]/58 px-3 py-2 backdrop-blur-md"
              key={step}
            >
              <span className="text-xs font-bold text-[#0f8d4b]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
