'use client';

import FanScene, { type MotorSceneState, type SectionId } from '@/components/fan-scene';
import { useEffect, useRef, useState, type WheelEvent } from 'react';

const sections: Array<{
  id: SectionId;
  eyebrow: string;
  title: string;
  description: string;
  mobileDescription: string;
}> = [
  {
    id: 'motor',
    eyebrow: '01 / DRIVE UNIT',
    title: 'Control the Climate',
    description:
      'A BLDC motor and axial fan built to move air through windowless pig houses with steady, precise control.',
    mobileDescription:
      'A BLDC motor and axial fan made for precise airflow in windowless pig houses.',
  },
  {
    id: 'controller',
    eyebrow: '02 / CONTROL & CONNECT',
    title: 'Control at the source',
    description:
      'SL-802B turns site conditions into ventilation commands, and the communication module links field devices to the cloud.',
    mobileDescription:
      'SL-802B turns site conditions into commands and links devices to the cloud.',
  },
  {
    id: 'cloud',
    eyebrow: '03 / CLOUD & DASHBOARD',
    title: 'See what the system knows',
    description: 'Monitor. Analyze. Control. The dashboard brings field data into one clear operating view.',
    mobileDescription: 'Monitor, analyze, and control field data in one dashboard view.',
  },
];

type DevViewport = 'pc' | 'mobile';

export default function Home() {
  const [devViewport, setDevViewport] = useState<DevViewport>('pc');
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('motor');
  const [motorSequence, setMotorSequence] = useState(0);
  const [dustWashing, setDustWashing] = useState(false);
  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    motor: null,
    controller: null,
    cloud: null,
  });
  const dustWashDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mobileLayout = devViewport === 'mobile' || isNarrowScreen;
  const previewFrame = devViewport === 'mobile';
  const shellH = previewFrame ? 'min-h-[calc(min(844px,100svh-5.5rem))]' : 'min-h-[100svh]';
  const stageH = previewFrame ? 'h-full' : 'h-[100svh]';
  const stagePos = previewFrame ? 'absolute' : 'fixed';

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const sync = () => setIsNarrowScreen(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (activeSection !== 'motor') {
      if (dustWashDelayRef.current) clearTimeout(dustWashDelayRef.current);
      dustWashDelayRef.current = null;
      setDustWashing(false);
      if (typeof document !== 'undefined') document.body.style.cursor = '';
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'motor') setMotorSequence((sequence) => sequence + 1);
  }, [activeSection]);

  useEffect(
    () => () => {
      if (dustWashDelayRef.current) clearTimeout(dustWashDelayRef.current);
    },
    [],
  );

  const handleMotorPhaseChange = (phase: MotorSceneState) => {
    if (phase === 'exploded') {
      if (dustWashDelayRef.current) clearTimeout(dustWashDelayRef.current);
      dustWashDelayRef.current = null;
      setDustWashing(false);
      return;
    }
    if (phase === 'spinning') {
      if (dustWashDelayRef.current) clearTimeout(dustWashDelayRef.current);
      dustWashDelayRef.current = setTimeout(() => {
        setDustWashing(true);
        dustWashDelayRef.current = null;
      }, 480);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (navigationLockRef.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute('data-section') as SectionId | null;
        if (id) setActiveSection(id);
      },
      { threshold: [0.45, 0.65, 0.85], rootMargin: '-8% 0px -8% 0px' },
    );

    Object.values(sectionRefs.current).forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => {
      observer.disconnect();
      if (navigationUnlockTimerRef.current) clearTimeout(navigationUnlockTimerRef.current);
    };
  }, [devViewport]);

  const scrollToSection = (id: SectionId) => {
    const target = sectionRefs.current[id];
    if (!target) return;

    navigationLockRef.current = true;
    setActiveSection(id);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (navigationUnlockTimerRef.current) clearTimeout(navigationUnlockTimerRef.current);
    navigationUnlockTimerRef.current = setTimeout(() => {
      navigationLockRef.current = false;
    }, 1200);
  };

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaY) < 12 || navigationLockRef.current) return;

    event.preventDefault();
    const currentIndex = sections.findIndex((section) => section.id === activeSection);
    const nextIndex = Math.max(0, Math.min(sections.length - 1, currentIndex + (event.deltaY > 0 ? 1 : -1)));
    if (nextIndex !== currentIndex) scrollToSection(sections[nextIndex].id);
  };

  const brochure = (
    <main
      onWheel={handleWheel}
      data-mobile={mobileLayout ? 'true' : 'false'}
      className={`relative select-none overflow-x-hidden bg-[#dfece5] text-[#17241d] ${
        previewFrame ? 'h-full overflow-y-auto overscroll-contain' : 'min-h-screen'
      }`}
    >
      {/* 3D stage — full shell; camera frames product into the upper mid band on mobile */}
      <div
        className={`${stagePos} inset-0 z-0 ${stageH} ${
          activeSection === 'motor' ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <FanScene
          activeSection={activeSection}
          onMotorPhaseChange={handleMotorPhaseChange}
          mobileLayout={mobileLayout}
        />
      </div>

      {mobileLayout ? (
        // Soft readability only near copy / chrome; mid band stays open for 3D.
        <div
          className={`pointer-events-none ${stagePos} inset-0 z-[1] bg-[linear-gradient(180deg,rgba(238,245,240,0.55)_0%,rgba(238,245,240,0.08)_14%,rgba(238,245,240,0)_38%,rgba(238,245,240,0.12)_62%,rgba(238,245,240,0.82)_100%)]`}
        />
      ) : activeSection === 'controller' ? (
        <div className="pointer-events-none fixed inset-y-0 left-0 z-[1] w-[min(100%,36rem)] bg-[linear-gradient(90deg,rgba(238,245,240,0.95)_0%,rgba(238,245,240,0.55)_72%,rgba(238,245,240,0)_100%)] sm:w-[min(100%,40rem)] lg:w-[min(100%,44rem)]" />
      ) : (
        <div
          className="pointer-events-none fixed inset-0 z-[1]"
          style={{
            background:
              activeSection === 'motor'
                ? 'linear-gradient(90deg, rgba(238,245,240,0.84) 0%, rgba(238,245,240,0.70) 28%, rgba(238,245,240,0.12) 62%, rgba(238,245,240,0) 100%)'
                : 'linear-gradient(90deg, rgba(238,245,240,0.98) 0%, rgba(238,245,240,0.82) 28%, rgba(238,245,240,0.12) 62%, rgba(238,245,240,0) 100%)',
          }}
        />
      )}
      {!mobileLayout && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-48 bg-[linear-gradient(0deg,rgba(238,245,240,0.9)_0%,rgba(238,245,240,0)_100%)]" />
      )}

      {/* Fixed top chrome */}
      <header
        className={`pointer-events-none ${stagePos} inset-x-0 top-0 z-30 flex items-center justify-between ${
          mobileLayout ? 'px-4 pb-2 pt-7' : 'px-6 py-6 sm:px-10 lg:px-14'
        }`}
      >
        <div className={`flex items-center ${mobileLayout ? 'gap-2' : 'gap-3'}`}>
          <span
            className={`grid place-items-center rounded-md bg-[#0f8d4b] font-black text-white ${
              mobileLayout ? 'size-8 text-xs' : 'size-9 text-sm'
            }`}
          >
            SI
          </span>
          <span
            className={`font-semibold tracking-[0.18em] text-[#0f8d4b] ${
              mobileLayout ? 'text-xs' : 'text-sm'
            }`}
          >
            SUNG-IL
          </span>
        </div>
        <span
          className={`rounded-full border border-[#b8cec1] bg-[#eef5f0]/70 font-semibold uppercase tracking-[0.14em] text-[#4d6b5b] backdrop-blur-md ${
            mobileLayout ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
          }`}
        >
          {sections.find((section) => section.id === activeSection)?.eyebrow}
        </span>
      </header>

      <div className="pointer-events-none relative z-10">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            data-section={section.id}
            ref={(element) => {
              sectionRefs.current[section.id] = element;
            }}
            className={
              mobileLayout
                ? // Mid band: top flex grows for 3D, bottom holds copy.
                  `relative flex ${shellH} snap-start flex-col px-4 pb-[4.75rem] pt-[3.75rem]`
                : 'relative flex min-h-[100svh] snap-start items-center px-6 py-28 sm:px-10 lg:px-14'
            }
          >
            {mobileLayout && (
              <div className="pointer-events-none min-h-0 flex-1" aria-hidden="true" />
            )}

            <div
              className={`pointer-events-auto ${
                mobileLayout
                  ? 'mobile-copy-panel w-full shrink-0 rounded-[1.1rem] px-3.5 pb-3.5 pt-3.5'
                  : 'max-w-2xl pb-14 pt-10 sm:pb-20 sm:pt-20'
              }`}
            >
              <div
                key={section.id === 'motor' ? motorSequence : section.id}
                className={section.id === 'motor' ? 'motor-copy-sequence' : undefined}
              >
                {section.id === 'motor' && (
                  <div aria-hidden="true" className={`motor-dust-pad${dustWashing ? ' is-washing' : ''}`} />
                )}
                <div className="relative z-[1]">
                  <p
                    className={`font-semibold uppercase tracking-[0.24em] text-[#0f8d4b] ${
                      mobileLayout ? 'mb-2 text-[11px]' : 'mb-5 text-sm'
                    }`}
                  >
                    {section.eyebrow}
                  </p>
                  <h1
                    className={`font-semibold leading-[0.95] text-[#132019] ${
                      mobileLayout
                        ? 'max-w-[13ch] text-[1.9rem]'
                        : 'max-w-xl text-5xl sm:text-7xl lg:text-8xl'
                    }`}
                  >
                    {section.title}
                  </h1>
                  <p
                    className={`text-[#486457] ${
                      mobileLayout
                        ? 'mt-2.5 max-w-[34ch] text-[0.86rem] leading-5'
                        : 'mt-7 max-w-xl text-lg leading-8 sm:text-xl sm:leading-9'
                    }`}
                  >
                    {mobileLayout ? section.mobileDescription : section.description}
                  </p>
                </div>
              </div>

              {section.id === 'motor' && (
                <div className={`flex flex-wrap gap-2.5 ${mobileLayout ? 'mt-4' : 'mt-10 gap-3'}`}>
                  <a
                    className={`select-none rounded-full bg-[#0f8d4b] font-semibold text-white shadow-[0_16px_34px_rgba(15,141,75,0.26)] ${
                      mobileLayout ? 'px-4 py-2.5 text-xs' : 'px-5 py-3 text-sm'
                    }`}
                    href="https://autofankorea.com/"
                  >
                    Homepage
                  </a>
                  <a
                    className={`select-none rounded-full border border-[#9fbaaa] bg-[#eef5f0]/62 font-semibold text-[#254736] backdrop-blur-md ${
                      mobileLayout ? 'px-4 py-2.5 text-xs' : 'px-5 py-3 text-sm'
                    }`}
                    href="https://smart.autofankorea.com/"
                  >
                    Dashboard
                  </a>
                </div>
              )}
            </div>

            {!mobileLayout && (
              <span className="pointer-events-none absolute bottom-24 right-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72907f] sm:right-10 lg:right-14">
                0{index + 1} / 0{sections.length}
              </span>
            )}
          </section>
        ))}
      </div>

      {/* Fixed bottom chrome */}
      <nav
        className={`pointer-events-auto ${stagePos} z-30 grid grid-cols-3 ${
          mobileLayout
            ? 'inset-x-3 bottom-3 gap-1.5'
            : 'inset-x-6 bottom-4 gap-2 sm:inset-x-10 lg:inset-x-14'
        }`}
      >
        {sections.map((section, index) => {
          const mobileLabel =
            section.id === 'motor' ? 'Drive' : section.id === 'controller' ? 'Control' : 'Cloud';
          return (
            <button
              key={section.id}
              type="button"
              aria-label={`Go to ${section.title}`}
              aria-current={activeSection === section.id ? 'step' : undefined}
              className={`flex items-center rounded-lg border text-left backdrop-blur-md transition-colors ${
                mobileLayout
                  ? 'min-h-11 flex-col justify-center gap-0.5 px-1.5 py-1.5'
                  : 'min-h-12 gap-3 px-3 py-2 text-sm'
              } ${
                activeSection === section.id
                  ? 'border-[#0f8d4b] bg-[#eef5f0]/86 text-[#244f38]'
                  : 'border-[#c9dbd0] bg-[#eef5f0]/58 text-[#516f61] hover:bg-[#eef5f0]/86'
              }`}
              onClick={() => scrollToSection(section.id)}
            >
              <span className={`font-bold text-[#0f8d4b] ${mobileLayout ? 'text-[10px]' : 'text-xs'}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={`truncate ${mobileLayout ? 'max-w-full text-[11px] leading-tight' : ''}`}>
                {mobileLayout ? mobileLabel : section.title}
              </span>
            </button>
          );
        })}
      </nav>
    </main>
  );

  return (
    <>
      <div className="pointer-events-auto fixed left-1/2 top-3 z-[120] flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#9fbaaa] bg-[#132019]/88 p-1 shadow-[0_12px_30px_rgba(19,32,25,0.28)] backdrop-blur-md">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b7d0c2]">
          Dev
        </span>
        {(['pc', 'mobile'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={devViewport === mode}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              devViewport === mode ? 'bg-[#0f8d4b] text-white' : 'text-[#d7ebe1] hover:bg-white/10'
            }`}
            onClick={() => setDevViewport(mode)}
          >
            {mode === 'pc' ? 'PC뷰' : '모바일뷰'}
          </button>
        ))}
      </div>

      {devViewport === 'mobile' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#101814] px-4 pb-4 pt-14">
          <div className="pointer-events-none absolute inset-x-0 top-14 text-center text-[11px] font-medium tracking-[0.18em] text-[#7f9a8c]">
            MOBILE PREVIEW · 390 × 844
          </div>
          <div className="relative h-[min(844px,calc(100svh-5.5rem))] w-[min(390px,100%)] overflow-hidden rounded-[2rem] border border-[#2c3d34] bg-[#dfece5] shadow-[0_30px_80px_rgba(0,0,0,0.45)] [transform:translateZ(0)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[50] flex justify-center pt-2">
              <div className="h-5 w-28 rounded-full bg-[#132019]/85" />
            </div>
            {brochure}
          </div>
        </div>
      ) : (
        brochure
      )}
    </>
  );
}
