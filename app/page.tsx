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
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

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
    description: 'Fans, hoods, and inlet windows.',
    descriptionRest: 'AC or BLDC, in the blade size the house needs.',
    mobileDescription: 'Fans, hoods, and inlet windows.',
    mobileDescriptionRest: 'AC or BLDC, sized to the house.',
  },
  {
    id: 'controller',
    eyebrow: '02 / CONTROL',
    title: 'Control',
    titleRest: 'the Flow',
    description: 'Channels, timers, and sizes.',
    descriptionRest: 'Control that fits the house you run.',
    mobileDescription: 'Channels, timers, and sizes.',
    mobileDescriptionRest: 'Control that fits the house.',
  },
  {
    id: 'cloud',
    eyebrow: '03 / OBSERVE',
    title: 'Observe',
    titleRest: 'the Field',
    description: 'Climate graphs. Barn status at a glance.',
    descriptionRest: 'Recommended temperatures, by the standard.',
    mobileDescription: 'Climate graphs. Status at a glance.',
    mobileDescriptionRest: 'Recommended temperatures by the standard.',
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

type ObservePoint = { i: string; x: number; y: number };

function observeLineD(points: ObservePoint[]) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function observeAreaD(points: ObservePoint[], height: number) {
  const line = observeLineD(points);
  const last = points[points.length - 1];
  if (!line || !last) return '';
  return `${line} L ${last.x.toFixed(2)} ${height} L 0 ${height} Z`;
}

function observeWavePoints(
  periodWidth: number,
  height: number,
  harmonics: Array<[cycles: number, amp: number, phase: number]>,
  baseline = 0.42,
  periods = 2,
) {
  if (periodWidth < 8 || height < 8) return [] as ObservePoint[];
  const stepsPer = 32;
  const steps = stepsPer * periods;
  const yPad = Math.max(8, height * 0.16);
  const usable = Math.max(8, height - yPad * 2);
  const valueAt = (t: number) => {
    const wobble = harmonics.reduce(
      (sum, [cycles, amp, phase]) => sum + amp * Math.sin((t * cycles + phase) * Math.PI * 2),
      0,
    );
    return Math.min(1, Math.max(0, baseline + wobble));
  };
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / stepsPer;
    return {
      i: `${index}`,
      x: t * periodWidth,
      y: yPad + (1 - valueAt(t)) * usable,
    };
  });
  points[points.length - 1].y = points[0].y;
  return points;
}

function observeMotorBars(periodWidth: number, height: number, periods = 2) {
  if (periodWidth < 8 || height < 8) return { barW: 8, bars: [] as Array<{ i: string; x: number; y: number; h: number }> };
  const countPer = Math.max(18, Math.round(periodWidth / 16));
  const step = periodWidth / countPer;
  const barW = step * 0.72;
  const yPad = Math.max(6, height * 0.12);
  const usable = Math.max(8, height - yPad);
  const bars = Array.from({ length: countPer * periods }, (_, index) => {
    const t = (index % countPer) / countPer;
    const n =
      0.22 +
      0.7 *
        (0.55 +
          0.28 * Math.sin((t * 3 + 0.08) * Math.PI * 2) +
          0.17 * Math.sin((t * 5 + 0.4) * Math.PI * 2));
    const h = Math.max(5, Math.min(1, n) * usable);
    return { i: `m${index}`, x: index * step, y: height - h, h };
  });
  return { barW, bars };
}

function ObservePeakBand({
  tone,
  width,
  height,
  points,
}: {
  tone: 'temp' | 'humid';
  width: number;
  height: number;
  points: ObservePoint[];
}) {
  const lineD = observeLineD(points);
  const areaD = observeAreaD(points, height);
  return (
    <div className={`copy-pad-band is-${tone}`}>
      <svg
        className="copy-pad-peak-svg"
        viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
        preserveAspectRatio="none"
      >
        {areaD ? <path className={`copy-pad-${tone}-area`} d={areaD} /> : null}
        {lineD ? <path className={`copy-pad-${tone}-line`} d={lineD} fill="none" /> : null}
      </svg>
    </div>
  );
}

function ObserveMotorBand({
  width,
  height,
  barW,
  bars,
}: {
  width: number;
  height: number;
  barW: number;
  bars: Array<{ i: string; x: number; y: number; h: number }>;
}) {
  const gradId = useId();
  return (
    <div className="copy-pad-band is-motor">
      <svg
        className="copy-pad-peak-svg"
        viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d5dcd8" />
            <stop offset="48%" stopColor="#aeb6b2" />
            <stop offset="100%" stopColor="#7e8682" />
          </linearGradient>
        </defs>
        {bars.map((bar) => (
          <rect
            key={bar.i}
            className="copy-pad-motor-bar"
            x={bar.x}
            y={bar.y}
            width={barW}
            height={bar.h}
            fill={`url(#${gradId})`}
          />
        ))}
      </svg>
    </div>
  );
}

function ObserveChartStack({
  width,
  height,
  tempPoints,
  humidPoints,
  motorBars,
  motorBarW,
}: {
  width: number;
  height: number;
  tempPoints: ObservePoint[];
  humidPoints: ObservePoint[];
  motorBars: Array<{ i: string; x: number; y: number; h: number }>;
  motorBarW: number;
}) {
  const bandH = height / 3;
  return (
    <div className="copy-pad-bands">
      <ObservePeakBand tone="temp" width={width} height={bandH} points={tempPoints} />
      <ObservePeakBand tone="humid" width={width} height={bandH} points={humidPoints} />
      <ObserveMotorBand width={width} height={bandH} barW={motorBarW} bars={motorBars} />
    </div>
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
      if (!layer) return;
      const width = layer.clientWidth;
      const height = layer.clientHeight;
      if (width < 8 || height < 8) return;
      setObserveSize({ w: width, h: height });
    };

    measure();
    const frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    const layer = observeLayerRef.current;
    const observer = new ResizeObserver(measure);
    if (layer) observer.observe(layer);
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

  const observeBandH = observeSize.h / 3;
  const observeSpanW = observeSize.w * 2;
  const observeTempPoints = observeWavePoints(
    observeSize.w,
    observeBandH,
    [
      [2, 0.28, 0.06],
      [1, 0.16, 0.22],
      [4, 0.07, 0.4],
    ],
    0.5,
  );
  const observeHumidPoints = observeWavePoints(
    observeSize.w,
    observeBandH,
    [
      [3, 0.22, 0.18],
      [5, 0.12, 0.62],
      [1, 0.1, 0.84],
    ],
    0.46,
  );
  const { barW: observeMotorBarW, bars: observeMotorBarItems } = observeMotorBars(observeSize.w, observeBandH);

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
                  ? 'mobile-copy-panel w-full min-h-[8rem] px-1 pb-3 pt-4'
                  : 'w-[min(100%,27rem)] min-h-[481px] max-w-2xl pb-14 pt-10 sm:pb-20 sm:pt-20'
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
              {section.id === 'controller' ? (
                <div className={`copy-pad-square${controllerOn ? ' is-on' : ''}`} aria-hidden="true">
                  <svg viewBox={`0 0 ${SQUARE_WAVE_VIEW_W} 36`} preserveAspectRatio="none">
                    <g className="copy-pad-square-scroll">
                      <path className="copy-pad-square-wave" d={SQUARE_WAVE_D} fill="none" />
                    </g>
                  </svg>
                </div>
              ) : null}
              {section.id === 'cloud' ? (
                <div
                  key={activeSection === 'cloud' ? 'pad-live' : 'pad-idle'}
                  className={`copy-pad-chart${activeSection === 'cloud' ? ' is-live' : ''}`}
                  style={{ '--cloud-chart-delay': `${CLOUD_CHART_AT_S}s` } as CSSProperties}
                  aria-hidden="true"
                >
                  <div ref={observeLayerRef} className="copy-pad-peak-viewport">
                    <div className="copy-pad-peak-scroll">
                      <div className="copy-pad-peak-layer">
                        <ObserveChartStack
                          width={observeSpanW}
                          height={observeSize.h}
                          tempPoints={observeTempPoints}
                          humidPoints={observeHumidPoints}
                          motorBars={observeMotorBarItems}
                          motorBarW={observeMotorBarW}
                        />
                      </div>
                    </div>
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
