'use client';

import FanScene, { type SectionId } from '@/components/fan-scene';
import { useEffect, useRef, useState, type WheelEvent } from 'react';

const sections: Array<{
  id: SectionId;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'motor',
    eyebrow: '01 / DRIVE UNIT',
    title: 'Control the Climate',
    description:
      'A BLDC motor and axial fan built to move air through windowless pig houses with steady, precise control.',
  },
  {
    id: 'controller',
    eyebrow: '02 / CONTROL UNIT',
    title: 'Control at the source',
    description:
      'SL-802B turns environmental conditions into a clear ventilation command at the point of operation.',
  },
  {
    id: 'communication',
    eyebrow: '03 / COMMUNICATION',
    title: 'Connect the field',
    description: 'Connect field devices to the cloud. Communication hardware will be added to this stage next.',
  },
  {
    id: 'cloud',
    eyebrow: '04 / CLOUD & DASHBOARD',
    title: 'See what the system knows',
    description: 'Monitor. Analyze. Control. The dashboard brings field data into one clear operating view.',
  },
];

export default function Home() {
  const [activeSection, setActiveSection] = useState<SectionId>('motor');
  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    motor: null,
    controller: null,
    communication: null,
    cloud: null,
  });

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
  }, []);

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

  return (
    <main onWheel={handleWheel} className="relative min-h-screen select-none overflow-x-hidden bg-[#dfece5] text-[#17241d]">
      <div className="pointer-events-none fixed inset-0 z-0 h-[100svh]">
        <FanScene activeSection={activeSection} />
      </div>

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background: activeSection === 'motor'
            ? 'linear-gradient(90deg, rgba(238,245,240,0.84) 0%, rgba(238,245,240,0.70) 28%, rgba(238,245,240,0.12) 62%, rgba(238,245,240,0) 100%)'
            : 'linear-gradient(90deg, rgba(238,245,240,0.98) 0%, rgba(238,245,240,0.82) 28%, rgba(238,245,240,0.12) 62%, rgba(238,245,240,0) 100%)',
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-48 bg-[linear-gradient(0deg,rgba(238,245,240,0.9)_0%,rgba(238,245,240,0)_100%)]" />

      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-[#0f8d4b] text-sm font-black text-white">SI</span>
          <span className="text-sm font-semibold tracking-[0.18em] text-[#0f8d4b]">SUNG-IL</span>
        </div>
        <span className="rounded-full border border-[#b8cec1] bg-[#eef5f0]/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#4d6b5b] backdrop-blur-md">
          {sections.find((section) => section.id === activeSection)?.eyebrow}
        </span>
      </header>

      <div className="relative z-10">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            data-section={section.id}
            ref={(element) => {
              sectionRefs.current[section.id] = element;
            }}
            className="relative flex min-h-[100svh] snap-start items-center px-6 py-28 sm:px-10 lg:px-14"
          >
            <div className="max-w-2xl pb-14 pt-10 sm:pb-20 sm:pt-20">
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-[#0f8d4b]">
                {section.eyebrow}
              </p>
              <h1 className="max-w-xl text-5xl font-semibold leading-[0.95] text-[#132019] sm:text-7xl lg:text-8xl">
                {section.title}
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-[#486457] sm:text-xl sm:leading-9">
                {section.description}
              </p>

              {section.id === 'motor' && (
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
              )}
            </div>

            <span className="pointer-events-none absolute bottom-24 right-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72907f] sm:right-10 lg:right-14">
              0{index + 1} / 04
            </span>
          </section>
        ))}
      </div>

      <nav className="pointer-events-auto fixed inset-x-6 bottom-4 z-30 grid grid-cols-2 gap-2 sm:inset-x-10 sm:grid-cols-4 lg:inset-x-14">
        {sections.map((section, index) => (
          <button
            key={section.id}
            type="button"
            aria-label={`Go to ${section.title}`}
            aria-current={activeSection === section.id ? 'step' : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm backdrop-blur-md transition-colors ${
              activeSection === section.id
                ? 'border-[#0f8d4b] bg-[#eef5f0]/86 text-[#244f38]'
                : 'border-[#c9dbd0] bg-[#eef5f0]/58 text-[#516f61] hover:bg-[#eef5f0]/86'
            }`}
            onClick={() => scrollToSection(section.id)}
          >
            <span className="text-xs font-bold text-[#0f8d4b]">{String(index + 1).padStart(2, '0')}</span>
            <span className="truncate">{section.title}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
