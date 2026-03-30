import type { ExtensionRuntimeMessage, GestureRuntimeMessage } from "./tools/gestureTypes";

const INDICATOR_ID = "browserassist-gesture-indicator";
const POINTER_ID = "browserassist-pointer";
const HOVER_RING_ID = "browserassist-hover-ring";
const OVERLAY_STYLE_ID = "browserassist-gesture-style";
const CALIBRATION_OVERLAY_ID = "browserassist-calibration-overlay";
const CALIBRATION_POINT_CLASS = "browserassist-calibration-point";
const CALIBRATION_ACTIVE_CLASS = "browserassist-calibration-point-active";
const CALIBRATION_DONE_CLASS = "browserassist-calibration-point-done";
const CALIBRATION_HINT_ID = "browserassist-calibration-hint";
const DWELL_CLICK_MS = 900;
const CLICK_COOLDOWN_MS = 900;
const ACTION_COOLDOWN_MS = 350;
const EYE_SCROLL_EDGE = 0.15;
const EYE_SCROLL_START_MS = 250;
const EYE_SCROLL_INTERVAL_MS = 180;
const EYE_SCROLL_STEP = 110;
const EYE_BACK_EDGE = 0.08;
const EYE_BACK_DWELL_MS = 650;
const EYE_BACK_COOLDOWN_MS = 1200;

const CALIBRATION_POINTS: Array<{ x: number; y: number }> = [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.9, y: 0.5 },
    { x: 0.1, y: 0.9 },
    { x: 0.5, y: 0.9 },
    { x: 0.9, y: 0.9 },
];

let pageZoom = 1;
let indicatorTimeout: number | null = null;
let dwellStart = 0;
let lastClickedAt = 0;
let lastDiscreteAction = 0;
let currentTarget: Element | null = null;
let calibrationIndex = 0;
let edgeDirection: "up" | "down" | null = null;
let edgeStartAt = 0;
let eyeScrollTimer: number | null = null;
let eyeBackStartAt = 0;
let lastEyeBackAt = 0;

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

const ensureOverlayStyles = (): void => {
    if (document.getElementById(OVERLAY_STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = OVERLAY_STYLE_ID;
    style.textContent = `
    #${INDICATOR_ID} {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 2147483647;
      background: rgba(10, 18, 40, 0.88);
      color: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.45);
      border-radius: 12px;
      padding: 8px 10px;
      font: 600 12px/1.2 "Segoe UI", sans-serif;
      box-shadow: 0 12px 28px rgba(2, 6, 23, 0.35);
      pointer-events: none;
      opacity: 0;
      transition: opacity 130ms ease;
    }

    #${POINTER_ID} {
      position: fixed;
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background: rgba(14, 165, 233, 0.85);
      border: 2px solid rgba(255, 255, 255, 0.95);
      box-shadow: 0 0 0 8px rgba(14, 165, 233, 0.22);
      z-index: 2147483646;
      transform: translate(-50%, -50%);
      pointer-events: none;
      opacity: 0;
      transition: opacity 80ms ease;
    }

    #${HOVER_RING_ID} {
      position: fixed;
      z-index: 2147483645;
      pointer-events: none;
      border: 2px dashed rgba(45, 212, 191, 0.95);
      border-radius: 10px;
      background: rgba(20, 184, 166, 0.08);
      opacity: 0;
      transition: opacity 110ms ease;
    }

        #${CALIBRATION_OVERLAY_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483644;
            pointer-events: auto;
            background: rgba(2, 6, 23, 0.35);
        }

        #${CALIBRATION_HINT_ID} {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483646;
            padding: 8px 14px;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.9);
            color: #e2e8f0;
            border: 1px solid rgba(148, 163, 184, 0.4);
            font: 600 12px/1.2 "Segoe UI", sans-serif;
            letter-spacing: 0.03em;
            box-shadow: 0 12px 24px rgba(2, 6, 23, 0.35);
            pointer-events: none;
        }

        .${CALIBRATION_POINT_CLASS} {
            position: absolute;
            width: 22px;
            height: 22px;
            border-radius: 999px;
            transform: translate(-50%, -50%);
            background: rgba(248, 250, 252, 0.3);
            border: 2px solid rgba(148, 163, 184, 0.8);
            box-shadow: 0 0 0 10px rgba(148, 163, 184, 0.2);
            cursor: pointer;
        }

        .${CALIBRATION_ACTIVE_CLASS} {
            background: rgba(251, 146, 60, 0.9);
            border-color: rgba(251, 146, 60, 0.95);
            box-shadow: 0 0 0 12px rgba(251, 146, 60, 0.3);
        }

        .${CALIBRATION_DONE_CLASS} {
            background: rgba(34, 211, 238, 0.9);
            border-color: rgba(34, 211, 238, 0.95);
            box-shadow: 0 0 0 10px rgba(34, 211, 238, 0.25);
        }
  `;
    document.documentElement.appendChild(style);
};

const ensureIndicator = (): HTMLDivElement => {
    ensureOverlayStyles();
    let indicator = document.getElementById(INDICATOR_ID) as HTMLDivElement | null;
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = INDICATOR_ID;
        document.documentElement.appendChild(indicator);
    }
    return indicator;
};

const ensurePointer = (): HTMLDivElement => {
    ensureOverlayStyles();
    let pointer = document.getElementById(POINTER_ID) as HTMLDivElement | null;
    if (!pointer) {
        pointer = document.createElement("div");
        pointer.id = POINTER_ID;
        document.documentElement.appendChild(pointer);
    }
    return pointer;
};

const ensureHoverRing = (): HTMLDivElement => {
    ensureOverlayStyles();
    let ring = document.getElementById(HOVER_RING_ID) as HTMLDivElement | null;
    if (!ring) {
        ring = document.createElement("div");
        ring.id = HOVER_RING_ID;
        document.documentElement.appendChild(ring);
    }
    return ring;
};

const showIndicator = (text: string): void => {
    const indicator = ensureIndicator();
    indicator.textContent = text;
    indicator.style.opacity = "1";

    if (indicatorTimeout !== null) {
        window.clearTimeout(indicatorTimeout);
    }
    indicatorTimeout = window.setTimeout(() => {
        indicator.style.opacity = "0";
    }, 850);
};

const discreteActionReady = (): boolean => {
    const now = Date.now();
    if (now - lastDiscreteAction < ACTION_COOLDOWN_MS) {
        return false;
    }
    lastDiscreteAction = now;
    return true;
};

const adjustZoom = (delta: number): void => {
    pageZoom = clamp(pageZoom + delta, 0.5, 2);
    (document.documentElement as HTMLElement).style.zoom = `${pageZoom}`;
    showIndicator(`Zoom ${Math.round(pageZoom * 100)}%`);
};

const moveHoverRing = (target: Element): void => {
    const ring = ensureHoverRing();
    const rect = target.getBoundingClientRect();

    ring.style.left = `${rect.left - 3}px`;
    ring.style.top = `${rect.top - 3}px`;
    ring.style.width = `${Math.max(16, rect.width + 6)}px`;
    ring.style.height = `${Math.max(16, rect.height + 6)}px`;
    ring.style.opacity = "1";
};

const hidePointUi = (): void => {
    const pointer = document.getElementById(POINTER_ID) as HTMLDivElement | null;
    const ring = document.getElementById(HOVER_RING_ID) as HTMLDivElement | null;
    if (pointer) {
        pointer.style.opacity = "0";
    }
    if (ring) {
        ring.style.opacity = "0";
    }
    dwellStart = 0;
    currentTarget = null;
};

const stopEyeScroll = (): void => {
    if (eyeScrollTimer !== null) {
        window.clearInterval(eyeScrollTimer);
        eyeScrollTimer = null;
    }
};

const resetEyeScrollState = (): void => {
    stopEyeScroll();
    edgeDirection = null;
    edgeStartAt = 0;
};

const resetEyeBackState = (): void => {
    eyeBackStartAt = 0;
};

const startEyeScroll = (direction: "up" | "down"): void => {
    if (eyeScrollTimer !== null) {
        return;
    }
    eyeScrollTimer = window.setInterval(() => {
        const delta = direction === "up" ? -EYE_SCROLL_STEP : EYE_SCROLL_STEP;
        window.scrollBy({ top: delta, behavior: "smooth" });
    }, EYE_SCROLL_INTERVAL_MS);
    showIndicator(direction === "up" ? "Eye scroll up" : "Eye scroll down");
};

const handleEyeEdgeScroll = (x: number, y: number): void => {
    const now = Date.now();
    let desired: "up" | "down" | null = null;
    if (y <= EYE_SCROLL_EDGE) {
        desired = "up";
    } else if (y >= 1 - EYE_SCROLL_EDGE) {
        desired = "down";
    }

    if (!desired) {
        resetEyeScrollState();
        return;
    }

    if (edgeDirection !== desired) {
        stopEyeScroll();
        edgeDirection = desired;
        edgeStartAt = now;
        return;
    }

    if (edgeStartAt === 0) {
        edgeStartAt = now;
        return;
    }

    if (now - edgeStartAt >= EYE_SCROLL_START_MS) {
        startEyeScroll(desired);
    }
};

const handleEyeEdgeBack = (x: number): boolean => {
    const now = Date.now();

    if (x > EYE_BACK_EDGE) {
        eyeBackStartAt = 0;
        return false;
    }

    if (eyeBackStartAt === 0) {
        eyeBackStartAt = now;
        return true;
    }

    if (now - lastEyeBackAt < EYE_BACK_COOLDOWN_MS) {
        return true;
    }

    if (now - eyeBackStartAt >= EYE_BACK_DWELL_MS) {
        lastEyeBackAt = now;
        eyeBackStartAt = 0;
        window.history.back();
        showIndicator("Eye back");
        return true;
    }

    return true;
};

const removeCalibrationOverlay = (): void => {
    const overlay = document.getElementById(CALIBRATION_OVERLAY_ID);
    if (overlay) {
        overlay.remove();
    }
    const hint = document.getElementById(CALIBRATION_HINT_ID);
    if (hint) {
        hint.remove();
    }
    calibrationIndex = 0;
};

const updateCalibrationMarkers = (overlay: HTMLElement): void => {
    const markers = Array.from(
        overlay.querySelectorAll(`.${CALIBRATION_POINT_CLASS}`),
    ) as HTMLDivElement[];
    markers.forEach((marker) => {
        const indexAttr = marker.getAttribute("data-index");
        if (indexAttr === null) return;
        const index = Number(indexAttr);
        marker.classList.toggle(CALIBRATION_ACTIVE_CLASS, index === calibrationIndex);
        marker.classList.toggle(CALIBRATION_DONE_CLASS, index < calibrationIndex);
    });
    const hint = document.getElementById(CALIBRATION_HINT_ID) as HTMLDivElement | null;
    if (hint) {
        hint.textContent = `Calibration ${calibrationIndex + 1} / ${CALIBRATION_POINTS.length} — click the highlighted dot`;
    }
};

const ensureCalibrationOverlay = (): HTMLDivElement => {
    ensureOverlayStyles();
    let overlay = document.getElementById(CALIBRATION_OVERLAY_ID) as HTMLDivElement | null;
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = CALIBRATION_OVERLAY_ID;
        const hint = document.createElement("div");
        hint.id = CALIBRATION_HINT_ID;
        hint.textContent = `Calibration ${calibrationIndex + 1} / ${CALIBRATION_POINTS.length} — click the highlighted dot`;
        overlay.appendChild(hint);
        overlay.addEventListener("click", (event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !target.classList.contains(CALIBRATION_POINT_CLASS)) {
                return;
            }
            const indexAttr = target.getAttribute("data-index");
            if (indexAttr === null) {
                return;
            }
            const index = Number(indexAttr);
            if (index !== calibrationIndex) {
                return;
            }
            chrome.runtime.sendMessage({
                source: "eye-tracking",
                type: "CALIBRATION_POINT",
                payload: { index },
            });
            calibrationIndex += 1;
            if (calibrationIndex >= CALIBRATION_POINTS.length) {
                chrome.runtime.sendMessage({
                    source: "eye-tracking",
                    type: "CALIBRATION_DONE",
                });
                removeCalibrationOverlay();
                return;
            }
            updateCalibrationMarkers(overlay);
        });
        CALIBRATION_POINTS.forEach((point, index) => {
            const marker = document.createElement("div");
            marker.className = CALIBRATION_POINT_CLASS;
            marker.setAttribute("data-index", index.toString());
            marker.style.left = `${point.x * 100}%`;
            marker.style.top = `${point.y * 100}%`;
            overlay.appendChild(marker);
        });

        document.documentElement.appendChild(overlay);
    }
    updateCalibrationMarkers(overlay);
    return overlay;
};

const triggerSyntheticClick = (element: Element, x: number, y: number): void => {
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y });
    const mouseUp = new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y });
    const click = new MouseEvent("click", { bubbles: true, clientX: x, clientY: y });
    element.dispatchEvent(mouseDown);
    element.dispatchEvent(mouseUp);
    element.dispatchEvent(click);
};

const handlePointMove = (payload?: GestureRuntimeMessage["payload"]): void => {
    if (typeof payload?.x !== "number" || typeof payload?.y !== "number") {
        hidePointUi();
        return;
    }

    const x = clamp(payload.x, 0, 1);
    const y = clamp(payload.y, 0, 1);
    const px = Math.round(x * window.innerWidth);
    const py = Math.round(y * window.innerHeight);

    const pointer = ensurePointer();
    pointer.style.left = `${px}px`;
    pointer.style.top = `${py}px`;
    pointer.style.opacity = "1";

    const hoveredElement = document.elementFromPoint(px, py);
    if (!hoveredElement) {
        hidePointUi();
        return;
    }

    moveHoverRing(hoveredElement);

    if (hoveredElement !== currentTarget) {
        currentTarget = hoveredElement;
        dwellStart = Date.now();
    }

    hoveredElement.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: px, clientY: py }),
    );

    const now = Date.now();
    if (currentTarget && now - dwellStart > DWELL_CLICK_MS && now - lastClickedAt > CLICK_COOLDOWN_MS) {
        lastClickedAt = now;
        triggerSyntheticClick(currentTarget, px, py);
        showIndicator("Dwell click");
    }
};

const handleGestureMessage = (message: GestureRuntimeMessage): void => {
    if (!message || message.source !== "gesture-engine") {
        return;
    }

    switch (message.type) {
        case "SWIPE_LEFT":
            if (discreteActionReady()) {
                window.history.back();
                showIndicator("Back");
            }
            break;
        case "SWIPE_RIGHT":
            if (discreteActionReady()) {
                window.history.forward();
                showIndicator("Forward");
            }
            break;
        case "SCROLL_UP":
            if (discreteActionReady()) {
                window.scrollBy({ top: -420, behavior: "smooth" });
                showIndicator("Scroll up");
            }
            break;
        case "SCROLL_DOWN":
            if (discreteActionReady()) {
                window.scrollBy({ top: 420, behavior: "smooth" });
                showIndicator("Scroll down");
            }
            break;
        case "PINCH_IN":
            if (discreteActionReady()) {
                adjustZoom(0.1);
            }
            break;
        case "PINCH_OUT":
            if (discreteActionReady()) {
                adjustZoom(-0.1);
            }
            break;
        case "POINT_MOVE":
            handlePointMove(message.payload);
            break;
        case "POINT_IDLE":
            hidePointUi();
            break;
        case "PAUSED":
            hidePointUi();
            showIndicator("Gesture listening paused");
            break;
        case "RESUMED":
            showIndicator("Gesture listening resumed");
            break;
        default:
            break;
    }
};
const handleEyeMessage = (message: ExtensionRuntimeMessage): void => {
    if (!message || message.source !== "eye-tracking") {
        return;
    }

    switch (message.type) {
        case "CALIBRATION_START":
            calibrationIndex = 0;
            ensureCalibrationOverlay();
            resetEyeScrollState();
            resetEyeBackState();
            showIndicator("Eye calibration started");
            break;
        case "CALIBRATION_STOP":
            removeCalibrationOverlay();
            resetEyeScrollState();
            resetEyeBackState();
            showIndicator("Eye calibration stopped");
            break;
        case "GAZE_MOVE":
            handlePointMove({ x: message.payload?.x, y: message.payload?.y });
            if (
                typeof message.payload?.x === "number" &&
                typeof message.payload?.y === "number"
            ) {
                const backHandled = handleEyeEdgeBack(message.payload.x);
                if (backHandled) {
                    resetEyeScrollState();
                    return;
                }
                handleEyeEdgeScroll(message.payload.x, message.payload.y);
            } else {
                resetEyeScrollState();
                resetEyeBackState();
            }
            break;
        default:
            break;
    }
};

chrome.runtime.onMessage.addListener((message: ExtensionRuntimeMessage) => {
    if (!message) return;
    if (message.source === "gesture-engine") {
        handleGestureMessage(message as GestureRuntimeMessage);
        return;
    }
    handleEyeMessage(message);
});

console.log("BrowserAssist gesture content script running");
