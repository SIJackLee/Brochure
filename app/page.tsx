'use client';

import type { MotorSceneState, SectionId } from '@/lib/scene-types';
import {
  CONTROLLER_POWER_END_S,
  CONTROLLER_TYPE_LINE_GAP_MS,
  CONTROLLER_TYPE_START_MS,
  CONTROLLER_TYPE_STEP_MS,
} from '@/lib/controller-boot';
import { CLOUD_CHART_AT_S, MOTOR_DUST_DELAY_SHOWCASE_MS, MOTOR_DUST_DELAY_SPIN_MS } from '@/lib/intro-timing';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

const FanScene = dynamic(() => import('@/components/fan-scene'), { ssr: false });

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
    eyebrow: '03 / OBSERVE',
    title: 'Observe',
    titleRest: 'the Field',
    description: 'Field data from every drive and command,',
    descriptionRest: 'in one operating view.',
    mobileDescription: 'Field data from every drive and command,',
    mobileDescriptionRest: 'in one operating view.',
  },
];

const SQUARE_WAVE_PERIOD = 40;
const SQUARE_WAVE_VIEW_W = 240;
const SQUARE_WAVE_Y_LOW = 34.5;
const SQUARE_WAVE_Y_HIGH = 1.5;

function squareWavePath(periods: number) {
  let d = `M 0 ${SQUARE_WAVE_Y_LOW}`;
  for (let i = 0; i < periods; i += 1) {
    const x0 = i * SQUARE_WAVE_PERIOD;
    d += ` H ${x0 + SQUARE_WAVE_PERIOD / 2} V ${SQUARE_WAVE_Y_HIGH} H ${x0 + SQUARE_WAVE_PERIOD} V ${SQUARE_WAVE_Y_LOW}`;
  }
  return d;
}

const SQUARE_WAVE_D = squareWavePath(7);

const OBSERVE_SCAN_S = 3;

type ObserveAnchor = { x: number; y: number };

function samplePolylineY(points: Array<{ x: number; y: number }>, x: number) {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return points[0].y;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (x <= right.x) {
      const span = right.x - left.x;
      const t = span <= 0 ? 0 : (x - left.x) / span;
      return left.y + (right.y - left.y) * t;
    }
  }
  return points[points.length - 1].y;
}

function observeChartPoints(anchors: ObserveAnchor[], width: number, height: number) {
  if (anchors.length === 0 || width < 8 || height < 8) return [];

  const dipY = (left: ObserveAnchor, right: ObserveAnchor) => {
    const sameLine = Math.abs(left.y - right.y) < 28;
    const dip = sameLine ? 16 : 8;
    return Math.min(height * 0.9, Math.max(left.y, right.y) + dip);
  };

  const peaks = anchors.map((anchor, index) => ({
    i: `p${index}`,
    x: anchor.x,
    y: anchor.y,
    peak: true as const,
  }));

  const points: Array<{ i: string; x: number; y: number; peak?: boolean }> = [];
  const first = peaks[0];
  if (first && first.x > 6) {
    const start = { x: 0, y: Math.min(height * 0.86, first.y + 14) };
    points.push({ i: 'start', ...start });
    points.push({ i: 'sv', x: first.x * 0.5, y: dipY(start, first) });
  }

  peaks.forEach((peak, index) => {
    points.push(peak);
    const next = peaks[index + 1];
    if (!next) return;
    points.push({
      i: `v${index}`,
      x: (peak.x + next.x) / 2,
      y: dipY(peak, next),
    });
  });

  const last = peaks[peaks.length - 1];
  if (last && last.x < width - 6) {
    const end = { x: width, y: Math.min(height * 0.86, last.y + 14) };
    points.push({ i: 'ev', x: (last.x + width) / 2, y: dipY(last, end) });
    points.push({ i: 'end', ...end });
  }

  return points;
}

function observeBarLayout(points: Array<{ x: number; y: number }>, width: number, height: number) {
  if (points.length === 0 || width < 8 || height < 8) return { barW: 8, bars: [] as Array<{ i: string; x: number; y: number }> };
  const targetW = Math.max(5, Math.min(9, width / 42));
  const count = Math.max(8, Math.round((2 * width / targetW + 1) / 3));
  const barW = (2 * width) / (3 * count - 1);
  const step = barW * 1.5;
  const bars = Array.from({ length: count }, (_, index) => {
    const x = index * step;
    const y = samplePolylineY(points, x + barW / 2);
    return { i: `b${index}`, x, y };
  });
  return { barW, bars };
}

function ObserveTitle({
  mobileLayout,
  letterRefs,
}: {
  mobileLayout: boolean;
  letterRefs: { current: Array<HTMLSpanElement | null> };
}) {
  const bind = (index: number) => (element: HTMLSpanElement | null) => {
    letterRefs.current[index] = element;
  };

  if (mobileLayout) {
    return (
      <>
        Ob<span ref={bind(0)}>s</span>erve the <span ref={bind(1)}>F</span>ield
      </>
    );
  }

  return (
    <>
      <span ref={bind(0)}>O</span>bserve
      <br />
      the <span ref={bind(1)}>F</span>ield
    </>
  );
}

export default function Home() {
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('motor');
  const [motorSequence, setMotorSequence] = useState(0);
  const [dustWashing, setDustWashing] = useState(false);
  const [typedLead, setTypedLead] = useState('');
  const [typedRest, setTypedRest] = useState('');
  const [typingLine, setTypingLine] = useState<'lead' | 'rest' | null>(null);
  const [controllerOn, setControllerOn] = useState(false);
  const [observeAnchors, setObserveAnchors] = useState<ObserveAnchor[]>([]);
  const [observeSize, setObserveSize] = useState({ w: 0, h: 0 });
  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    motor: null,
    controller: null,
    cloud: null,
  });
  const dustWashDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const observeLayerRef = useRef<HTMLDivElement | null>(null);
  const observeLetterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const mobileLayout = isNarrowScreen;
  const stageH = 'h-[100svh]';
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

  useLayoutEffect(() => {
    const measure = () => {
      const layer = observeLayerRef.current;
      const letters = observeLetterRefs.current.slice(0, 2);
      if (!layer || letters.length < 2 || letters.some((letter) => !letter)) return;
      const box = layer.getBoundingClientRect();
      const width = layer.clientWidth;
      const height = layer.clientHeight;
      if (width < 8 || height < 8 || box.width < 8 || box.height < 8) return;
      const scaleX = width / box.width;
      const scaleY = height / box.height;
      const yRatios = mobileLayout ? [0.2, 0.5] : [0.5, 0.06];
      setObserveSize({ w: width, h: height });
      setObserveAnchors(
        letters.map((letter, index) => {
          const rect = letter!.getBoundingClientRect();
          return {
            x: Math.min(width, Math.max(0, (rect.left + rect.width / 2 - box.left) * scaleX)),
            y: Math.min(height, Math.max(0, (rect.top + rect.height * yRatios[index] - box.top) * scaleY)),
          };
        }),
      );
    };

    measure();
    const frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    const layer = observeLayerRef.current;
    const observer = new ResizeObserver(measure);
    if (layer) observer.observe(layer);
    observeLetterRefs.current.forEach((letter) => {
      if (letter) observer.observe(letter);
    });
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [mobileLayout, activeSection]);

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
  }, [mobileLayout]);

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
  const scrollToSectionRef = useRef(scrollToSection);
  scrollToSectionRef.current = scrollToSection;

  useEffect(() => {
    const node = mainRef.current;
    if (!node) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      if (Math.abs(event.deltaY) < 12 || navigationLockRef.current) return;
      event.preventDefault();
      const currentIndex = sections.findIndex((section) => section.id === activeSectionRef.current);
      const nextIndex = Math.max(0, Math.min(sections.length - 1, currentIndex + (event.deltaY > 0 ? 1 : -1)));
      if (nextIndex !== currentIndex) scrollToSectionRef.current(sections[nextIndex].id);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const observePoints = observeChartPoints(observeAnchors, observeSize.w, observeSize.h);
  const observeLineD = observePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const observeLast = observePoints[observePoints.length - 1];
  const observeAreaD = observeLast
    ? `${observeLineD} L ${observeLast.x.toFixed(2)} ${observeSize.h} L 0 ${observeSize.h} Z`
    : '';
  const observePeaks = observePoints.filter((point) => point.peak);
  const { barW: observeBarW, bars: observeBars } = observeBarLayout(observePoints, observeSize.w, observeSize.h);

  return (
    <main
      ref={mainRef}
      data-mobile={mobileLayout ? 'true' : 'false'}
      data-section={activeSection}
      className={`relative select-none overflow-x-hidden bg-[#dfece5] text-[#17241d] ${
        mobileLayout
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
                  : section.id === 'cloud'
                    ? 'max-w-[26rem] pb-12 pt-10 sm:max-w-[28rem] sm:pb-14 sm:pt-14'
                    : 'max-w-2xl pb-14 pt-10 sm:pb-20 sm:pt-20'
              }`}
            >
              {!mobileLayout && section.id !== 'cloud' && (
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
              {section.id === 'cloud' ? (
                <div
                  key={activeSection === 'cloud' ? 'pad-live' : 'pad-idle'}
                  className={`copy-pad-chart${activeSection === 'cloud' ? ' is-live' : ''}`}
                  style={{ '--cloud-chart-delay': `${CLOUD_CHART_AT_S}s` } as CSSProperties}
                  aria-hidden="true"
                >
                  <div ref={observeLayerRef} className="copy-pad-peak-layer">
                    <svg
                      className="copy-pad-peak-svg"
                      viewBox={`0 0 ${Math.max(observeSize.w, 1)} ${Math.max(observeSize.h, 1)}`}
                      preserveAspectRatio="none"
                    >
                      {observeBars.map((bar, index) => (
                        <rect
                          key={bar.i}
                          className="copy-pad-peak-bar"
                          x={bar.x}
                          y={bar.y}
                          width={observeBarW}
                          height={Math.max(0, observeSize.h - bar.y)}
                          style={
                            {
                              '--bar-rise-delay': `calc(var(--cloud-chart-delay, 0.64s) + ${index * 0.012}s)`,
                            } as CSSProperties
                          }
                        />
                      ))}
                      {observeAreaD ? <path className="copy-pad-peak-area" d={observeAreaD} /> : null}
                      {observeLineD ? (
                        <path className="copy-pad-peak-line" d={observeLineD} fill="none" pathLength={1} />
                      ) : null}
                    </svg>
                    {observePeaks.map((peak) => (
                      <span
                        key={peak.i}
                        className="copy-pad-peak"
                        style={
                          {
                            left: `${peak.x}px`,
                            top: `${peak.y}px`,
                            '--echo-at': `${observeSize.w > 0 ? (peak.x / observeSize.w) * OBSERVE_SCAN_S : 0}s`,
                          } as CSSProperties
                        }
                      >
                        <span className="copy-pad-peak-core" />
                        <span className="copy-pad-peak-echo" />
                        <span className="copy-pad-peak-echo is-late" />
                        <span className="copy-pad-peak-echo is-later" />
                      </span>
                    ))}
                    <span className="copy-pad-scan" />
                  </div>
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
                  {section.id === 'controller' ? (
                    <div className={`copy-pad-square${controllerOn ? ' is-on' : ''}`} aria-hidden="true">
                      <svg viewBox={`0 0 ${SQUARE_WAVE_VIEW_W} 36`} preserveAspectRatio="none">
                        <g className="copy-pad-square-scroll">
                          <path className="copy-pad-square-wave" d={SQUARE_WAVE_D} fill="none" />
                        </g>
                      </svg>
                    </div>
                  ) : null}
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
                        ? 'w-max max-w-full whitespace-nowrap text-[1.65rem]'
                        : `${section.titleRest ? 'w-max max-w-none whitespace-nowrap' : 'max-w-xl'} text-5xl sm:text-7xl lg:text-8xl`
                    } ${section.id === 'controller' && activeSection === 'controller' ? 'relative' : ''}`}
                  >
                    {section.id === 'controller' && activeSection === 'controller' ? (
                      <>
                        <span className="invisible" aria-hidden="true">
                          {section.title}
                          {mobileLayout ? ' ' : <br />}
                          {section.titleRest}
                        </span>
                        <span className="absolute inset-0">
                          {typedLead}
                          {typingLine === 'lead' ? <span className="control-caret" aria-hidden="true" /> : null}
                          {mobileLayout ? ' ' : <br />}
                          {typedRest}
                          {typingLine === 'rest' ? <span className="control-caret" aria-hidden="true" /> : null}
                        </span>
                      </>
                    ) : section.id === 'cloud' ? (
                      <ObserveTitle mobileLayout={mobileLayout} letterRefs={observeLetterRefs} />
                    ) : (
                      <>
                        {section.title}
                        {section.titleRest ? (
                          <>
                            {mobileLayout ? ' ' : <br />}
                            {section.titleRest}
                          </>
                        ) : null}
                      </>
                    )}
                  </h1>
                  <p
                    className={`copy-body text-[#486457] ${
                      mobileLayout
                        ? `mt-2.5 max-w-full leading-5 ${section.id === 'controller' ? 'text-[0.8rem]' : 'text-[0.86rem]'}`
                        : section.id === 'cloud'
                          ? 'mt-5 max-w-none text-base leading-7'
                          : 'mt-7 max-w-xl text-lg leading-8 sm:text-xl sm:leading-9'
                    }`}
                  >
                    <span className="whitespace-nowrap">
                      {mobileLayout ? section.mobileDescription : section.description}
                    </span>
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
            section.id === 'motor' ? 'Drive' : section.id === 'controller' ? 'Control' : 'Observe';
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
}
