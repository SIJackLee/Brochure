'use client';

import FanScene, { type MotorSceneState, type SectionId } from '@/components/fan-scene';
import {
  CONTROLLER_POWER_END_S,
  CONTROLLER_TYPE_LINE_GAP_MS,
  CONTROLLER_TYPE_START_MS,
  CONTROLLER_TYPE_STEP_MS,
} from '@/lib/controller-boot';
import { MOTOR_DUST_DELAY_SHOWCASE_MS, MOTOR_DUST_DELAY_SPIN_MS } from '@/lib/intro-timing';
import Image from 'next/image';
import { useEffect, useRef, useState, type WheelEvent } from 'react';

const sections: Array<{
  id: SectionId;
  eyebrow: string;
  title: string;
  titleRest?: string;
  description: string;
  descriptionRest?: string;
  mobileDescription: string;
  mobileDescriptionRest?: string;
}> = [
  {
    id: 'motor',
    eyebrow: '01 / DRIVE',
    title: 'Drive',
    titleRest: 'the Air',
    description: 'A BLDC motor and axial fan',
    descriptionRest: 'that drives air through houses.',
    mobileDescription: 'A BLDC motor and axial fan',
    mobileDescriptionRest: 'that drives air through houses.',
  },
  {
    id: 'controller',
    eyebrow: '02 / CONTROL',
    title: 'Control',
    titleRest: 'the Flow',
    description: 'Controller turns barn conditions into fan commands.',
    descriptionRest: 'The comm module carries that flow to the cloud.',
    mobileDescription: 'Controller turns barn conditions into fan commands.',
    mobileDescriptionRest: 'The comm module carries that flow to the cloud.',
  },
  {
    id: 'cloud',
    eyebrow: '03 / MONITOR',
    title: 'See what the system knows',
    description: 'Field data from every drive and command,',
    descriptionRest: 'in one operating view.',
    mobileDescription: 'Field data from every drive and command,',
    mobileDescriptionRest: 'in one operating view.',
  },
];

type DevViewport = 'pc' | 'mobile';

export default function Home() {
  const [devViewport, setDevViewport] = useState<DevViewport>('pc');
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('motor');
  const [motorSequence, setMotorSequence] = useState(0);
  const [dustWashing, setDustWashing] = useState(false);
  const [typedLead, setTypedLead] = useState('');
  const [typedRest, setTypedRest] = useState('');
  const [typingLine, setTypingLine] = useState<'lead' | 'rest' | null>(null);
  const [controllerOn, setControllerOn] = useState(false);
  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    motor: null,
    controller: null,
    cloud: null,
  });
  const dustWashDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const mobileLayout = devViewport === 'mobile' || isNarrowScreen;
  const previewFrame = devViewport === 'mobile';
  const stageH = previewFrame ? 'h-full' : 'h-[100svh]';
  const stagePos = 'fixed';

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

  useEffect(() => {
    if (activeSection !== 'controller') {
      setTypedLead('');
      setTypedRest('');
      setTypingLine(null);
      return;
    }

    const lead = 'Control';
    const rest = 'the Flow';
    const startMs = CONTROLLER_TYPE_START_MS;
    const stepMs = CONTROLLER_TYPE_STEP_MS;
    const lineGapMs = CONTROLLER_TYPE_LINE_GAP_MS;
    const timers: ReturnType<typeof setTimeout>[] = [];

    setTypedLead('');
    setTypedRest('');
    setTypingLine(null);

    lead.split('').forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          setTypedLead(lead.slice(0, index + 1));
          setTypingLine(index === lead.length - 1 ? 'rest' : 'lead');
        }, startMs + index * stepMs),
      );
    });

    const restStart = startMs + lead.length * stepMs + lineGapMs;
    rest.split('').forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          setTypedRest(rest.slice(0, index + 1));
          if (index === rest.length - 1) setTypingLine(null);
        }, restStart + index * stepMs),
      );
    });

    return () => timers.forEach(clearTimeout);
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'controller') {
      setControllerOn(false);
      return;
    }
    const timer = setTimeout(() => setControllerOn(true), Math.round(CONTROLLER_POWER_END_S * 1000));
    return () => clearTimeout(timer);
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
    if (phase === 'spinning' || phase === 'showcase') {
      if (dustWashDelayRef.current) return;
      dustWashDelayRef.current = setTimeout(() => {
        setDustWashing(true);
        dustWashDelayRef.current = null;
      }, phase === 'spinning' ? MOTOR_DUST_DELAY_SPIN_MS : MOTOR_DUST_DELAY_SHOWCASE_MS);
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
      {
        // PC scrolls the viewport; mobile uses the snap container as the root.
        root: mobileLayout ? mainRef.current : null,
        threshold: [0.45, 0.65, 0.85],
        rootMargin: '-8% 0px -8% 0px',
      },
    );

    Object.values(sectionRefs.current).forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => {
      observer.disconnect();
      if (navigationUnlockTimerRef.current) clearTimeout(navigationUnlockTimerRef.current);
    };
  }, [devViewport, mobileLayout]);

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
      ref={mainRef}
      onWheel={handleWheel}
      data-mobile={mobileLayout ? 'true' : 'false'}
      className={`relative select-none overflow-x-hidden bg-[#dfece5] text-[#17241d] ${
        previewFrame
          ? 'h-full snap-y snap-mandatory overflow-y-auto overscroll-contain'
          : mobileLayout
            ? 'h-svh snap-y snap-mandatory overflow-y-auto overscroll-contain'
            : 'min-h-screen'
      }`}
    >
      {/* 3D stage — fixed canvas; mobile sections only switch scene/copy over it. */}
      <div
        className={`${stagePos} inset-0 z-0 ${stageH} ${
          activeSection === 'motor' || activeSection === 'cloud' ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <FanScene
          activeSection={activeSection}
          onMotorPhaseChange={handleMotorPhaseChange}
          mobileLayout={mobileLayout}
        />
      </div>

      {mobileLayout ? (
        <div
          className={`pointer-events-none ${stagePos} inset-0 z-[1] bg-[linear-gradient(180deg,rgba(238,245,240,0.32)_0%,rgba(238,245,240,0)_12%,rgba(238,245,240,0)_72%,rgba(238,245,240,0.5)_100%)]`}
        />
      ) : (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-28 bg-[linear-gradient(0deg,rgba(238,245,240,0.62)_0%,rgba(238,245,240,0)_100%)]" />
      )}

      {/* Fixed top hero chrome */}
      <header
        className={`pointer-events-none ${stagePos} inset-x-0 top-0 z-30 flex items-center justify-between ${
          mobileLayout ? 'mobile-hero-chrome px-4 pb-3 pt-7' : 'px-6 py-6 sm:px-10 lg:px-14'
        }`}
      >
        <div className="flex items-center">
          <Image
            src="/brand/sung-il-logo.png"
            alt="SUNG-IL"
            width={407}
            height={96}
            priority
            className={`w-auto ${mobileLayout ? 'h-7' : 'h-9'}`}
          />
        </div>
        <div className={`pointer-events-auto flex items-center ${mobileLayout ? 'gap-1.5' : 'gap-2.5'}`}>
          <a
            className={`select-none rounded-full bg-[#0f8d4b] font-semibold text-white shadow-[0_12px_24px_rgba(15,141,75,0.22)] ${
              mobileLayout ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'
            }`}
            href="https://autofankorea.com/"
          >
            Homepage
          </a>
          <a
            className={`select-none rounded-full border border-[#9fbaaa] bg-[#eef5f0]/80 font-semibold text-[#254736] backdrop-blur-md ${
              mobileLayout ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'
            }`}
            href="https://smart.autofankorea.com/"
          >
            Dashboard
          </a>
        </div>
      </header>

      <div className="contents">
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
                ? 'mobile-section-layout pointer-events-none relative z-10 grid h-full snap-start overflow-hidden px-4'
                : 'pointer-events-none relative flex min-h-[100svh] snap-start items-center px-6 py-28 sm:px-10 lg:px-14'
            }
          >
            {mobileLayout && (
              <div className="pointer-events-none mobile-render-band" aria-hidden="true" />
            )}

            <div
              className={`pointer-events-auto relative ${
                mobileLayout
                  ? 'mobile-copy-panel w-full px-1 pb-3 pt-4'
                  : 'max-w-2xl pb-14 pt-10 sm:pb-20 sm:pt-20'
              }`}
            >
              {!mobileLayout && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-y-12 -left-6 right-[-5rem] z-0 sm:-left-10 lg:-left-14"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(238,245,240,0.9) 0%, rgba(238,245,240,0.58) 58%, rgba(238,245,240,0) 100%)',
                  }}
                />
              )}
              {section.id === 'motor' && (
                <>
                  <div aria-hidden="true" className={`motor-dust-pad${dustWashing ? ' is-washing' : ''}`} />
                  <div aria-hidden="true" className={`copy-air-pad${dustWashing ? ' is-revealed' : ''}`} />
                </>
              )}
              {section.id === 'controller' ? (
                <div
                  aria-hidden="true"
                  className={`copy-pad-pulse${controllerOn ? ' is-on' : ''}`}
                />
              ) : null}
              {section.id === 'cloud' ? (
                <div className="copy-pad-chart" aria-hidden="true">
                  <span className="copy-pad-chart-bar" style={{ height: '38%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '22%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '54%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '31%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '72%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '44%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '61%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '36%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '80%' }} />
                  <span className="copy-pad-chart-bar" style={{ height: '48%' }} />
                </div>
              ) : null}
              <div
                key={section.id === 'motor' ? motorSequence : section.id}
                className={`relative z-[1] ${section.id === 'motor' ? 'motor-copy-sequence' : ''}`}
              >
                <div className={`relative z-[1] ${
                  section.id === 'controller'
                    ? 'copy-with-aside copy-title-pair'
                    : section.id === 'cloud'
                      ? 'copy-with-aside'
                      : ''
                }`}>
                  <p
                    className={`copy-eyebrow font-semibold uppercase tracking-[0.24em] text-[#0f8d4b] ${
                      mobileLayout ? 'mb-2 text-[11px]' : 'mb-5 text-sm'
                    }`}
                  >
                    {section.eyebrow}
                  </p>
                  <h1
                    className={`copy-title font-semibold leading-[0.92] text-[#132019] ${
                      mobileLayout
                        ? 'max-w-[13ch] text-[1.9rem]'
                        : `${section.titleRest ? 'w-max max-w-none whitespace-nowrap' : 'max-w-xl'} text-5xl sm:text-7xl lg:text-8xl`
                    } ${section.id === 'controller' && activeSection === 'controller' ? 'relative' : ''}`}
                  >
                    {section.id === 'controller' && activeSection === 'controller' ? (
                      <>
                        <span className="invisible" aria-hidden="true">
                          {section.title}
                          <br />
                          {section.titleRest}
                        </span>
                        <span className="absolute inset-0">
                          {typedLead}
                          {typingLine === 'lead' ? <span className="control-caret" aria-hidden="true" /> : null}
                          <br />
                          {typedRest}
                          {typingLine === 'rest' ? <span className="control-caret" aria-hidden="true" /> : null}
                        </span>
                      </>
                    ) : (
                      <>
                        {section.title}
                        {section.titleRest ? (
                          <>
                            <br />
                            {section.titleRest}
                          </>
                        ) : null}
                      </>
                    )}
                  </h1>
                  {section.id === 'controller' ? (
                    <div
                      className={`copy-aside copy-pulse-aside${controllerOn ? ' is-on' : ''}`}
                      aria-hidden="true"
                    />
                  ) : null}
                  {section.id === 'cloud' ? (
                    <div className="copy-aside copy-chart-aside" aria-hidden="true">
                      <span className="copy-chart-bar" style={{ height: '42%' }} />
                      <span className="copy-chart-bar" style={{ height: '28%' }} />
                      <span className="copy-chart-bar" style={{ height: '68%' }} />
                      <span className="copy-chart-bar" style={{ height: '36%' }} />
                      <span className="copy-chart-bar" style={{ height: '82%' }} />
                      <span className="copy-chart-bar" style={{ height: '54%' }} />
                    </div>
                  ) : null}
                  <p
                    className={`copy-body text-[#486457] ${
                      mobileLayout
                        ? 'mt-2.5 max-w-[34ch] text-[0.86rem] leading-5'
                        : 'mt-7 max-w-xl text-lg leading-8 sm:text-xl sm:leading-9'
                    }`}
                  >
                    {mobileLayout ? section.mobileDescription : section.description}
                    {(mobileLayout ? section.mobileDescriptionRest : section.descriptionRest) ? (
                      <>
                        <br />
                        {mobileLayout ? section.mobileDescriptionRest : section.descriptionRest}
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
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
            ? 'mobile-section-nav inset-x-3 bottom-3 gap-1.5'
            : 'inset-x-6 bottom-4 gap-2 sm:inset-x-10 lg:inset-x-14'
        }`}
      >
        {sections.map((section) => {
          const navLabel =
            section.id === 'motor' ? 'Drive' : section.id === 'controller' ? 'Control' : 'Monitor';
          return (
            <button
              key={section.id}
              type="button"
              aria-label={`Go to ${navLabel}`}
              aria-current={activeSection === section.id ? 'step' : undefined}
              className={`flex items-center justify-center rounded-lg border text-center font-semibold backdrop-blur-md transition-colors ${
                mobileLayout ? 'min-h-11 px-1.5 py-1.5 text-sm' : 'min-h-14 px-4 py-2.5 text-lg'
              } ${
                activeSection === section.id
                  ? 'border-[#0f8d4b] bg-[#eef5f0]/86 text-[#244f38]'
                  : 'border-[#c9dbd0] bg-[#eef5f0]/58 text-[#516f61] hover:bg-[#eef5f0]/86'
              }`}
              onClick={() => scrollToSection(section.id)}
            >
              {navLabel}
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
