"use client";

import { useEffect, useRef, useState } from "react";

const BIFROST_SIZE = 600;
const AURORA_SIZE = 700;

const STATIC_BIFROST = { x: 0.25, y: 0.3 };
const STATIC_AURORA = { x: 0.75, y: 0.7 };

const LEADER_LERP = 0.12;
const LAGGARD_LERP = 0.06;

function lerp(current: number, target: number, factor: number) {
  return current + (target - current) * factor;
}

function staticTransform(xRatio: number, yRatio: number, size: number) {
  return `translate(calc(${xRatio * 100}vw - ${size / 2}px), calc(${yRatio * 100}vh - ${size / 2}px))`;
}

function prefersStaticInteraction() {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function HaloBackground() {
  const bifrostRef = useRef<HTMLDivElement>(null);
  const auroraRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const bifrostPosRef = useRef({ x: 0, y: 0 });
  const auroraPosRef = useRef({ x: 0, y: 0 });
  const [isInteractive, setIsInteractive] = useState(false);

  useEffect(() => {
    function updateMode() {
      setIsInteractive(!prefersStaticInteraction());
    }

    updateMode();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");

    reducedMotion.addEventListener("change", updateMode);
    coarsePointer.addEventListener("change", updateMode);

    return () => {
      reducedMotion.removeEventListener("change", updateMode);
      coarsePointer.removeEventListener("change", updateMode);
    };
  }, []);

  useEffect(() => {
    const bifrost = bifrostRef.current;
    const aurora = auroraRef.current;
    if (!bifrost || !aurora) {
      return;
    }

    function applyStaticPositions() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      bifrost!.style.transform = `translate(${STATIC_BIFROST.x * width - BIFROST_SIZE / 2}px, ${STATIC_BIFROST.y * height - BIFROST_SIZE / 2}px)`;
      aurora!.style.transform = `translate(${STATIC_AURORA.x * width - AURORA_SIZE / 2}px, ${STATIC_AURORA.y * height - AURORA_SIZE / 2}px)`;
    }

    if (!isInteractive) {
      applyStaticPositions();
      window.addEventListener("resize", applyStaticPositions);
      return () => window.removeEventListener("resize", applyStaticPositions);
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    targetRef.current = { x: centerX, y: centerY };
    bifrostPosRef.current = { x: centerX, y: centerY };
    auroraPosRef.current = { x: centerX, y: centerY };

    function onMouseMove(event: MouseEvent) {
      targetRef.current = { x: event.clientX, y: event.clientY };
    }

    window.addEventListener("mousemove", onMouseMove);

    let frameId = 0;

    function tick() {
      const target = targetRef.current;

      bifrostPosRef.current = {
        x: lerp(bifrostPosRef.current.x, target.x, LEADER_LERP),
        y: lerp(bifrostPosRef.current.y, target.y, LEADER_LERP),
      };

      auroraPosRef.current = {
        x: lerp(auroraPosRef.current.x, bifrostPosRef.current.x, LAGGARD_LERP),
        y: lerp(auroraPosRef.current.y, bifrostPosRef.current.y, LAGGARD_LERP),
      };

      bifrost!.style.transform = `translate(${bifrostPosRef.current.x - BIFROST_SIZE / 2}px, ${bifrostPosRef.current.y - BIFROST_SIZE / 2}px)`;
      aurora!.style.transform = `translate(${auroraPosRef.current.x - AURORA_SIZE / 2}px, ${auroraPosRef.current.y - AURORA_SIZE / 2}px)`;

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, [isInteractive]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-niflheim"
    >
      <div
        ref={bifrostRef}
        className="absolute rounded-full opacity-20 blur-[100px] will-change-transform"
        style={{
          width: BIFROST_SIZE,
          height: BIFROST_SIZE,
          background:
            "radial-gradient(circle, var(--bifrost) 0%, transparent 70%)",
          transform: staticTransform(STATIC_BIFROST.x, STATIC_BIFROST.y, BIFROST_SIZE),
        }}
      />
      <div
        ref={auroraRef}
        className="absolute rounded-full opacity-[0.18] blur-[120px] will-change-transform"
        style={{
          width: AURORA_SIZE,
          height: AURORA_SIZE,
          background:
            "radial-gradient(circle, var(--aurora) 0%, transparent 70%)",
          transform: staticTransform(STATIC_AURORA.x, STATIC_AURORA.y, AURORA_SIZE),
        }}
      />
    </div>
  );
}
