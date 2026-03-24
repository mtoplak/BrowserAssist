import type { GestureRuntimeMessage } from "./tools/gestureTypes";

const INDICATOR_ID = "browserassist-gesture-indicator";
const POINTER_ID = "browserassist-pointer";
const HOVER_RING_ID = "browserassist-hover-ring";
const OVERLAY_STYLE_ID = "browserassist-gesture-style";
const DWELL_CLICK_MS = 900;
const CLICK_COOLDOWN_MS = 900;
const ACTION_COOLDOWN_MS = 350;

let pageZoom = 1;
let indicatorTimeout: number | null = null;
let dwellStart = 0;
let lastClickedAt = 0;
let lastDiscreteAction = 0;
let currentTarget: Element | null = null;

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

    ring.style.left = `${rect.left + window.scrollX - 3}px`;
    ring.style.top = `${rect.top + window.scrollY - 3}px`;
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

chrome.runtime.onMessage.addListener((message: GestureRuntimeMessage) => {
    handleGestureMessage(message);
});

console.log("BrowserAssist gesture content script running");
