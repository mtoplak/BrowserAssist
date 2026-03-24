import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { handleGoToOptions } from "./tools/functions";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type {
  GestureAction,
  GestureRuntimeMessage,
} from "./tools/gestureTypes";
import "./index.css";

const ACTION_COOLDOWN_MS = 750;
const POINT_FRAME_INTERVAL_MS = 75;
const SWIPE_THRESHOLD = 0.085;
const PINCH_DELTA_THRESHOLD = 0.014;

const getStartupErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      const lower = error.message.toLowerCase();
      if (lower.includes("dismissed")) {
        return "Camera prompt was dismissed. Click Start again and choose Allow for the extension popup.";
      }
      return "Camera access was blocked. Allow camera for this extension popup and retry.";
    }
    if (error.name === "NotFoundError") {
      return "No camera device found.";
    }
    if (error.name === "NotReadableError") {
      return "Camera is in use by another app or unavailable.";
    }
    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown startup error";
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const fingerExtended = (
  landmarks: Array<{ x: number; y: number; z: number }>,
  tip: number,
  pip: number,
  mcp: number,
): boolean =>
  landmarks[tip].y < landmarks[pip].y && landmarks[pip].y < landmarks[mcp].y;

const isPointGesture = (
  landmarks: Array<{ x: number; y: number; z: number }>,
): boolean => {
  const indexUp = fingerExtended(landmarks, 8, 6, 5);
  const middleDown = landmarks[12].y > landmarks[10].y;
  const ringDown = landmarks[16].y > landmarks[14].y;
  const pinkyDown = landmarks[20].y > landmarks[18].y;
  return indexUp && middleDown && ringDown && pinkyDown;
};

const isOpenPalm = (
  landmarks: Array<{ x: number; y: number; z: number }>,
): boolean => {
  const indexUp = fingerExtended(landmarks, 8, 6, 5);
  const middleUp = fingerExtended(landmarks, 12, 10, 9);
  const ringUp = fingerExtended(landmarks, 16, 14, 13);
  const pinkyUp = fingerExtended(landmarks, 20, 18, 17);
  const thumbOpen = Math.abs(landmarks[4].x - landmarks[3].x) > 0.03;
  return indexUp && middleUp && ringUp && pinkyUp && thumbOpen;
};

const distance = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const App: React.FC = () => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("Idle");
  const [lastGesture, setLastGesture] = useState<string>("None");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const isActiveRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const lastActionTsRef = useRef<number>(0);
  const lastPointTsRef = useRef<number>(0);
  const wristHistoryRef = useRef<Array<{ x: number; y: number; t: number }>>(
    [],
  );
  const previousPinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const sendToActiveTab = useCallback(
    async (message: GestureRuntimeMessage): Promise<void> => {
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          return;
        }
        await chrome.tabs.sendMessage(activeTab.id, message);
      } catch {
        // Ignore pages where content scripts are not allowed.
      }
    },
    [],
  );

  const triggerAction = useCallback(
    async (
      type: GestureAction,
      label: string,
      payload?: GestureRuntimeMessage["payload"],
      useCooldown: boolean = true,
    ): Promise<void> => {
      const now = Date.now();
      if (useCooldown && now - lastActionTsRef.current < ACTION_COOLDOWN_MS) {
        return;
      }
      if (useCooldown) {
        lastActionTsRef.current = now;
      }

      setLastGesture(label);
      await sendToActiveTab({
        source: "gesture-engine",
        type,
        payload: { ...payload, label },
      });
    },
    [sendToActiveTab],
  );

  const stopEngine = useCallback(async (): Promise<void> => {
    isActiveRef.current = false;
    setIsActive(false);
    setStatusText("Stopped");

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close();
      handLandmarkerRef.current = null;
    }

    previousPinchDistanceRef.current = null;
    wristHistoryRef.current = [];
    await triggerAction("POINT_IDLE", "Pointer idle", undefined, false);
  }, [triggerAction]);

  const startEngine = useCallback(async (): Promise<void> => {
    if (isActiveRef.current) {
      return;
    }

    setStatusText("Checking camera access…");

    // Check if camera permission is already granted.
    let cameraAllowed = false;
    try {
      const perm = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      cameraAllowed = perm.state === "granted";
    } catch {
      /* Permissions API may not support camera query in this context */
    }

    // Side panels can't reliably show permission prompts — open a dedicated
    // window so the user sees a real Chrome permission dialog.
    if (!cameraAllowed) {
      setStatusText("Requesting camera permission…");
      cameraAllowed = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean): void => {
          if (settled) return;
          settled = true;
          chrome.runtime.onMessage.removeListener(onMsg);
          resolve(value);
        };

        const onMsg = (message: { type: string }): void => {
          if (message.type === "CAMERA_PERMISSION_GRANTED") settle(true);
          else if (message.type === "CAMERA_PERMISSION_DENIED") settle(false);
        };
        chrome.runtime.onMessage.addListener(onMsg);

        chrome.windows
          .create({
            url: chrome.runtime.getURL("permission.html"),
            type: "popup",
            width: 460,
            height: 320,
            focused: true,
          })
          .then((win) => {
            if (!win?.id) {
              settle(false);
              return;
            }
            const onClosed = (id: number): void => {
              if (id !== win.id) return;
              chrome.windows.onRemoved.removeListener(onClosed);
              setTimeout(() => settle(false), 300);
            };
            chrome.windows.onRemoved.addListener(onClosed);
          })
          .catch(() => settle(false));
      });
    }

    if (!cameraAllowed) {
      setStatusText("Camera access denied. Grant permission and retry.");
      return;
    }

    setStatusText("Starting camera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          facingMode: "user",
        },
        audio: false,
      });

      const wasmBasePath = chrome.runtime.getURL("assets/mediapipe/wasm");
      const vision = await FilesetResolver.forVisionTasks(wasmBasePath);

      handLandmarkerRef.current = await HandLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
        },
      );

      if (!videoRef.current) {
        throw new Error("Video element missing");
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setIsPaused(false);
      isPausedRef.current = false;
      setStatusText("Listening for gestures");
      setLastGesture("Ready");

      isActiveRef.current = true;
      setIsActive(true);
      await triggerAction("RESUMED", "Listening resumed", undefined, false);

      const detectLoop = async (): Promise<void> => {
        if (
          !isActiveRef.current ||
          !handLandmarkerRef.current ||
          !videoRef.current
        ) {
          return;
        }

        const now = Date.now();
        const result = handLandmarkerRef.current.detectForVideo(
          videoRef.current,
          now,
        );
        const landmarks = result.landmarks?.[0];

        if (!landmarks || landmarks.length === 0) {
          previousPinchDistanceRef.current = null;
          wristHistoryRef.current = [];
          await triggerAction("POINT_IDLE", "Pointer idle", undefined, false);
          rafRef.current = requestAnimationFrame(() => {
            void detectLoop();
          });
          return;
        }

        const wrist = landmarks[0];
        wristHistoryRef.current.push({ x: wrist.x, y: wrist.y, t: now });
        if (wristHistoryRef.current.length > 6) {
          wristHistoryRef.current.shift();
        }

        const isPointing = isPointGesture(landmarks);
        const openPalm = isOpenPalm(landmarks);

        if (openPalm && !isPausedRef.current) {
          setIsPaused(true);
          isPausedRef.current = true;
          setStatusText("Paused (open palm detected)");
          await triggerAction("PAUSED", "Paused", undefined, false);
        }

        if (isPointing && !isPausedRef.current) {
          const indexTip = landmarks[8];
          if (now - lastPointTsRef.current > POINT_FRAME_INTERVAL_MS) {
            lastPointTsRef.current = now;
            await triggerAction(
              "POINT_MOVE",
              "Pointing",
              {
                x: clamp01(1 - indexTip.x),
                y: clamp01(indexTip.y),
                confidence: 1,
              },
              false,
            );
          }
        } else {
          await triggerAction("POINT_IDLE", "Pointer idle", undefined, false);
        }

        if (!isPausedRef.current && wristHistoryRef.current.length >= 4) {
          const first = wristHistoryRef.current[0];
          const last =
            wristHistoryRef.current[wristHistoryRef.current.length - 1];
          const dx = last.x - first.x;
          const dy = last.y - first.y;

          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
            if (dx > 0) {
              await triggerAction("SWIPE_RIGHT", "Swipe right: forward");
            } else {
              await triggerAction("SWIPE_LEFT", "Swipe left: back");
            }
          }

          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
            if (dy > 0) {
              await triggerAction("SCROLL_DOWN", "Swipe down: scroll");
            } else {
              await triggerAction("SCROLL_UP", "Swipe up: scroll");
            }
          }
        }

        const pinchDistance = distance(landmarks[4], landmarks[8]);
        if (previousPinchDistanceRef.current !== null && !isPausedRef.current) {
          const delta = pinchDistance - previousPinchDistanceRef.current;
          if (delta > PINCH_DELTA_THRESHOLD) {
            await triggerAction("PINCH_IN", "Pinch out: zoom in");
          } else if (delta < -PINCH_DELTA_THRESHOLD) {
            await triggerAction("PINCH_OUT", "Pinch in: zoom out");
          }
        }
        previousPinchDistanceRef.current = pinchDistance;

        rafRef.current = requestAnimationFrame(() => {
          void detectLoop();
        });
      };

      rafRef.current = requestAnimationFrame(() => {
        void detectLoop();
      });
    } catch (error) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
      const errorMessage = getStartupErrorMessage(error);
      setStatusText(`Unable to start: ${errorMessage}`);
      setIsActive(false);
      isActiveRef.current = false;
      console.error("Failed to start gesture engine", error);
    }
  }, [triggerAction]);

  useEffect(() => {
    return () => {
      void stopEngine();
    };
  }, [stopEngine]);

  const handlePauseToggle = async (): Promise<void> => {
    if (!isActive) {
      return;
    }
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
    setStatusText(nextPaused ? "Paused" : "Listening for gestures");
    await triggerAction(
      nextPaused ? "PAUSED" : "RESUMED",
      nextPaused ? "Paused" : "Resumed",
      undefined,
      false,
    );
  };

  return (
    <main className="nebula-shell popup-shell">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <section className="glass-card w-full">
        <p className="chip-label">Browser Assist</p>
        <h1 className="hero-title mt-3">Gesture Navigation Deck</h1>
        <p className="hero-copy mt-3">
          Hands are tracked locally in this popup using MediaPipe. No webcam
          data leaves your device.
        </p>

        <div className="camera-shell mt-5">
          <video ref={videoRef} className="camera-feed" muted playsInline />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="metric-card">
            <p className="metric-kicker">Engine</p>
            <p className="metric-value">{isActive ? "Running" : "Stopped"}</p>
          </div>
          <div className="metric-card">
            <p className="metric-kicker">Status</p>
            <p className="metric-value">{isPaused ? "Paused" : "Listening"}</p>
          </div>
          <div className="metric-card col-span-2">
            <p className="metric-kicker">Last Gesture</p>
            <p className="metric-value">{lastGesture}</p>
            <p className="status-note mt-1">{statusText}</p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          {!isActive ? (
            <button
              className="primary-cta w-full"
              onClick={() => void startEngine()}
            >
              Start Gesture Control
            </button>
          ) : (
            <button
              className="primary-cta w-full"
              onClick={() => void stopEngine()}
            >
              Stop Engine
            </button>
          )}
          <button
            className="counter-btn counter-btn-primary"
            onClick={() => void handlePauseToggle()}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        </div>

        {/*<button
          className="counter-btn counter-btn-ghost mt-3 w-full"
          onClick={handleGoToOptions}
        >
          Open Options Panel
        </button>*/}

        <p className="status-note mt-4">
          Gestures: swipe left/right, swipe up/down, pinch in/out, point +
          dwell, open palm to pause.
        </p>
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<App />);
