(function () {
  const NAV_KEY = 'motoras_page_loader_nav';
  const MIN_DURATION = 760;
  const PRE_NAV_DELAY = 120;
  const EXIT_DURATION = 900;
  const FADE_DURATION = 220;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let overlayRef = null;
  let rafId = 0;
  let state = null;

  function nowMs() {
    return Date.now();
  }

  function readNavStart() {
    try {
      return parseInt(sessionStorage.getItem(NAV_KEY) || '0', 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  function markNavStart() {
    try {
      sessionStorage.setItem(NAV_KEY, String(nowMs()));
    } catch (error) {
      return;
    }
  }

  function clearNavStart() {
    try {
      sessionStorage.removeItem(NAV_KEY);
    } catch (error) {
      return;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function buildLoader() {
    const existing = document.getElementById('pageLoader');
    if (existing) return existing;

    const overlay = document.createElement('div');
    overlay.className = 'page-loader';
    overlay.id = 'pageLoader';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="page-loader__stage" id="pageLoaderStage">
        <div class="page-loader__ambient" id="pageLoaderAmbient"></div>
        <div class="page-loader__road" id="pageLoaderRoad" aria-hidden="true">
          <div class="page-loader__road-line"></div>
        </div>
        <div class="page-loader__motion" id="pageLoaderMotion" aria-hidden="true">
          <div class="page-loader__car" id="pageLoaderCar">
            <svg class="page-loader__car-svg" viewBox="0 0 860 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Motoraș loader car">
              <g class="page-loader__car-body" id="pageLoaderBody">
                <path d="M143 288c0-65 51-113 117-113h267c82 0 146 15 190 46 40 29 76 82 76 121 0 27-22 42-61 42H103c-38 0-63-16-63-42 0-15 5-33 15-54 18-40 49-70 88-88z" fill="var(--page-loader-car)"/>
                <path d="M413 168c20-34 49-57 82-66 31-8 61 1 80 24 14 18 24 44 19 64l-181-1z" fill="var(--page-loader-car)"/>
                <path d="M348 133c-18-34-55-51-95-45-20 3-42 13-55 27 30-4 57 1 78 17 18 14 37 30 57 31-9-8-16-18-22-30-5 1-8 1-11 0 9-1 16-1 25 0 7 12 15 23 23 30-1-12-6-22-13-30-5-1-10-2-16-3 8-1 16-1 24 0z" fill="var(--page-loader-car)"/>
                <path d="M393 175c-16 15-31 40-40 78-7 31-19 45-32 45-16 0-29-18-38-54-8-31-7-62 5-92 13-31 37-52 66-57 21-4 40 3 53 20-18 14-32 34-42 60-2 7-4 14-6 21 11-5 22-12 34-21z" fill="var(--page-loader-car)"/>
                <path d="M141 289c22-48 69-79 127-79h262c111 0 190 31 233 90" stroke="var(--page-loader-car)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M232 328c112-2 233-5 364-4 67 0 123 3 171 8" stroke="var(--page-loader-car)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M564 201l70 74" stroke="var(--page-loader-car)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M597 201c26 0 48 9 61 25" stroke="var(--page-loader-car)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
                <ellipse cx="621" cy="281" rx="24" ry="37" fill="var(--page-loader-car)"/>
                <ellipse cx="781" cy="283" rx="22" ry="35" fill="var(--page-loader-car)"/>
                <ellipse cx="621" cy="281" rx="14" ry="25" fill="var(--page-loader-car-highlight)"/>
                <ellipse cx="781" cy="283" rx="13" ry="23" fill="var(--page-loader-car-highlight)"/>
              </g>
              <g transform="translate(110 336)">
                <ellipse cx="0" cy="0" rx="57" ry="57" fill="var(--page-loader-car)"/>
                <ellipse cx="0" cy="0" rx="38" ry="38" fill="var(--page-loader-car-highlight)"/>
                <ellipse cx="0" cy="0" rx="18" ry="18" fill="var(--page-loader-car)"/>
                <g class="page-loader__wheel-rim" id="pageLoaderWheelFront">
                  <path d="M0 -34V34M-34 0H34M-24 -24L24 24M24 -24L-24 24" stroke="var(--page-loader-car)" stroke-width="6" stroke-linecap="round"/>
                </g>
              </g>
              <g transform="translate(527 336)">
                <ellipse cx="0" cy="0" rx="57" ry="57" fill="var(--page-loader-car)"/>
                <ellipse cx="0" cy="0" rx="38" ry="38" fill="var(--page-loader-car-highlight)"/>
                <ellipse cx="0" cy="0" rx="18" ry="18" fill="var(--page-loader-car)"/>
                <g class="page-loader__wheel-rim" id="pageLoaderWheelRear">
                  <path d="M0 -34V34M-34 0H34M-24 -24L24 24M24 -24L-24 24" stroke="var(--page-loader-car)" stroke-width="6" stroke-linecap="round"/>
                </g>
              </g>
            </svg>
            <div class="page-loader__shadow" id="pageLoaderShadow"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function createState() {
    return {
      startTime: performance.now(),
      phase: 'idle',
      completeRequested: false,
      exitStart: 0,
      idleSnapshot: null,
      nodes: null
    };
  }

  function ensureState() {
    if (!state) state = createState();
    if (!state.nodes) {
      state.nodes = {
        stage: document.getElementById('pageLoaderStage'),
        ambient: document.getElementById('pageLoaderAmbient'),
        road: document.getElementById('pageLoaderRoad'),
        motion: document.getElementById('pageLoaderMotion'),
        car: document.getElementById('pageLoaderCar'),
        body: document.getElementById('pageLoaderBody'),
        wheelFront: document.getElementById('pageLoaderWheelFront'),
        wheelRear: document.getElementById('pageLoaderWheelRear'),
        shadow: document.getElementById('pageLoaderShadow')
      };
    }
    return state;
  }

  function setVisible(overlay, visible) {
    if (!overlay) return;
    overlay.classList.toggle('is-visible', visible);
    overlay.classList.remove('is-fading');
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    document.body.classList.toggle('page-loader-lock', visible);
    document.documentElement.classList.remove('page-loader-boot');
    if (!visible) overlay.style.display = '';
  }

  function getStageMetrics() {
    const current = ensureState();
    const rect = current.nodes.stage.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function getIdleFrame(now) {
    const metrics = getStageMetrics();
    const progress = ((now - ensureState().startTime) % 3200) / 3200;
    const wave = Math.sin(progress * Math.PI * 2);
    const wave2 = Math.sin(progress * Math.PI * 4);
    return {
      width: metrics.width,
      height: metrics.height,
      x: wave * metrics.width * 0.12,
      y: (-Math.abs(wave2) * 8) + (Math.sin(progress * Math.PI * 6) * 1.5),
      rotation: wave * 1.1 + wave2 * 0.2,
      bodyRotation: -wave * 0.75 + wave2 * 0.28,
      shadowScale: 0.95 - Math.abs(wave2) * 0.07,
      ambientOpacity: 0.92 - Math.abs(wave) * 0.05
    };
  }

  function applyIdleFrame(frame, time) {
    const current = ensureState();
    const wheelDeg = -((time - current.startTime) / 760) * 360;
    current.nodes.motion.style.transform = `translate3d(calc(-50% + ${frame.x}px), ${frame.y}px, 0)`;
    current.nodes.car.style.transform = `rotate(${frame.rotation}deg) scale(1)`;
    current.nodes.body.style.transform = `rotate(${frame.bodyRotation}deg)`;
    current.nodes.wheelFront.style.transform = `rotate(${wheelDeg}deg)`;
    current.nodes.wheelRear.style.transform = `rotate(${wheelDeg * 1.08}deg)`;
    current.nodes.shadow.style.transform = `translate3d(-50%, 0, 0) scaleX(${frame.shadowScale})`;
    current.nodes.shadow.style.opacity = String(0.82 - Math.abs(frame.rotation) * 0.03);
    current.nodes.ambient.style.opacity = String(frame.ambientOpacity);
  }

  function beginExit(time) {
    const current = ensureState();
    if (current.phase !== 'idle') return;
    current.phase = 'exiting';
    current.exitStart = time;
    current.idleSnapshot = getIdleFrame(time);
  }

  function applyExitFrame(time) {
    const current = ensureState();
    const snap = current.idleSnapshot || getIdleFrame(time);
    const t = clamp((time - current.exitStart) / EXIT_DURATION, 0, 1);
    const x = snap.x + (snap.width * 0.66 - snap.x) * easeOutQuint(t);
    const y = snap.y + ((-snap.height * 0.44) - snap.y) * easeInOutCubic(t);
    const rotation = snap.rotation + (-27 - snap.rotation) * easeOutCubic(t);
    const bodyRotation = snap.bodyRotation + (-10 - snap.bodyRotation) * easeOutCubic(t);
    const scale = 1 + (0.84 - 1) * easeOutCubic(t);
    const wheelDeg = -(360 + t * 900);
    const fadeStart = 0.58;
    const fadeProgress = t <= fadeStart ? 0 : (t - fadeStart) / (1 - fadeStart);
    const overlayOpacity = 1 - easeOutCubic(clamp(fadeProgress, 0, 1));

    current.nodes.motion.style.transform = `translate3d(calc(-50% + ${x}px), ${y}px, 0)`;
    current.nodes.car.style.transform = `rotate(${rotation}deg) scale(${scale})`;
    current.nodes.body.style.transform = `rotate(${bodyRotation}deg)`;
    current.nodes.wheelFront.style.transform = `rotate(${wheelDeg}deg)`;
    current.nodes.wheelRear.style.transform = `rotate(${wheelDeg * 1.06}deg)`;
    current.nodes.shadow.style.transform = `translate3d(-50%, 0, 0) scaleX(${snap.shadowScale + (0.72 - snap.shadowScale) * t})`;
    current.nodes.shadow.style.opacity = String(0.74 * (1 - t));
    current.nodes.road.style.opacity = String(1 - easeOutCubic(t));
    current.nodes.ambient.style.opacity = String(1 - t * 0.45);
    overlayRef.style.opacity = String(overlayOpacity);

    if (t >= 1) finish();
  }

  function loop(time) {
    const current = ensureState();

    if (prefersReducedMotion) {
      const minReached = time - current.startTime >= MIN_DURATION;
      if (current.completeRequested && minReached) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(loop);
      return;
    }

    if (current.phase === 'idle') {
      const frame = getIdleFrame(time);
      applyIdleFrame(frame, time);
      if (current.completeRequested && time - current.startTime >= MIN_DURATION) beginExit(time);
    } else if (current.phase === 'exiting') {
      applyExitFrame(time);
    }

    rafId = requestAnimationFrame(loop);
  }

  function startAnimation(elapsedMs) {
    const current = ensureState();
    current.startTime = performance.now() - Math.min(Math.max(elapsedMs || 0, 0), MIN_DURATION);
    current.phase = 'idle';
    current.completeRequested = false;
    current.exitStart = 0;
    current.idleSnapshot = null;
    overlayRef.style.opacity = '1';
    overlayRef.style.display = '';
    overlayRef.classList.remove('is-fading');
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function finish() {
    const current = ensureState();
    current.phase = 'done';
    cancelAnimationFrame(rafId);
    overlayRef.classList.add('is-fading');
    overlayRef.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('page-loader-lock');
    document.documentElement.classList.remove('page-loader-boot');
    window.setTimeout(() => {
      overlayRef.classList.remove('is-visible');
      overlayRef.style.display = 'none';
      overlayRef.style.opacity = '';
      clearNavStart();
    }, FADE_DURATION);
  }

  function completeLoader() {
    const current = ensureState();
    current.completeRequested = true;
  }

  function isSamePage(targetHref) {
    if (!targetHref) return true;
    try {
      return new URL(targetHref, location.href).href === location.href;
    } catch (error) {
      return true;
    }
  }

  function shouldHandleLink(anchor, event) {
    if (!anchor || event.defaultPrevented) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return false;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return false;
    if (url.href === location.href) return false;
    return true;
  }

  function navigate(targetHref, delay) {
    if (!targetHref || isSamePage(targetHref)) return false;
    const overlay = overlayRef || buildLoader();
    overlayRef = overlay;
    markNavStart();
    setVisible(overlay, true);
    startAnimation(0);
    window.setTimeout(() => {
      location.href = targetHref;
    }, Number(delay || PRE_NAV_DELAY));
    return true;
  }

  function boot() {
    overlayRef = buildLoader();
    const pendingStart = readNavStart();
    const hasPendingNavigation = !!pendingStart;

    if (hasPendingNavigation) {
      setVisible(overlayRef, true);
      startAnimation(nowMs() - pendingStart);
      if (document.readyState === 'complete') {
        window.setTimeout(completeLoader, 48);
      } else {
        window.addEventListener('load', function onLoad() {
          window.setTimeout(completeLoader, 48);
        }, { once: true });
      }
    } else {
      overlayRef.style.display = 'none';
      document.documentElement.classList.remove('page-loader-boot');
    }

    document.addEventListener('click', function onClick(event) {
      const anchor = event.target.closest('a');
      if (!shouldHandleLink(anchor, event)) return;
      event.preventDefault();
      navigate(anchor.href, PRE_NAV_DELAY);
    });

    window.addEventListener('pageshow', function onPageShow(event) {
      if (!event.persisted) return;
      clearNavStart();
      cancelAnimationFrame(rafId);
      overlayRef.classList.remove('is-visible', 'is-fading');
      overlayRef.style.display = 'none';
      overlayRef.style.opacity = '';
      document.body.classList.remove('page-loader-lock');
      document.documentElement.classList.remove('page-loader-boot');
    });

    window.completeLoader = completeLoader;
    window.MotorasPageLoader = {
      show() {
        markNavStart();
        setVisible(overlayRef, true);
        startAnimation(0);
      },
      complete: completeLoader,
      navigate: function navigateWithOptions(targetHref, options) {
        const delay = options && typeof options.delay !== 'undefined' ? Number(options.delay) : PRE_NAV_DELAY;
        return navigate(targetHref, delay);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
