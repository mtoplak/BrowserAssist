import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { ExtensionRuntimeMessage } from "../../tools/gestureTypes";

const EYE_POINT_INTERVAL_MS = 75;
const EMA_ALPHA = 0.22;
const GAZE_DEADZONE = 0.012;
const CALIBRATION_SAMPLE_WINDOW_MS = 650;
const CALIBRATION_SAMPLE_TARGET = 12;
const CALIBRATION_SAMPLE_MIN = 6;
const LEFT_IRIS = [468, 469, 470, 471];
const RIGHT_IRIS = [472, 473, 474, 475];
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

type EyeGazeSample = { x: number; y: number } | null;
type EyeMapping = {
  ax: number;
  bx: number;
  ay: number;
  by: number;
  minMappedX: number;
  maxMappedX: number;
  minMappedY: number;
  maxMappedY: number;
} | null;

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

const EyeTrackingPanel: React.FC = () => {
  const [isEyeActive, setIsEyeActive] = useState<boolean>(false);
  const [eyeStatusText, setEyeStatusText] = useState<string>("Idle");
  const [lastGaze, setLastGaze] = useState<EyeGazeSample>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationIndex, setCalibrationIndex] = useState<number>(0);
  const [calibrationSamples, setCalibrationSamples] = useState<
    Array<EyeGazeSample>
  >([]);

  const eyeVideoRef = useRef<HTMLVideoElement | null>(null);
  const eyeStreamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const eyeRafRef = useRef<number | null>(null);
  const isEyeActiveRef = useRef<boolean>(false);
  const lastEyePointTsRef = useRef<number>(0);
  const lastGazeRef = useRef<EyeGazeSample>(null);
  const eyeMappingRef = useRef<EyeMapping>(null);
  const calibrationSamplesRef = useRef<Array<EyeGazeSample>>([]);
  const smoothedGazeRef = useRef<{ x: number; y: number } | null>(null);
  const pendingCalibrationRef = useRef<{
    index: number;
    startedAt: number;
    samples: Array<{ x: number; y: number }>;
  } | null>(null);

  useEffect(() => {
    lastGazeRef.current = lastGaze;
  }, [lastGaze]);

  const sendToActiveTab = useCallback(
    async (message: ExtensionRuntimeMessage): Promise<void> => {
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

  const getIrisCenter = (
    landmarks: Array<{ x: number; y: number; z: number }>,
    indices: number[],
  ): { x: number; y: number } | null => {
    if (landmarks.length <= Math.max(...indices)) {
      return null;
    }
    const sum = indices.reduce(
      (acc, index) => {
        acc.x += landmarks[index].x;
        acc.y += landmarks[index].y;
        return acc;
      },
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / indices.length,
      y: sum.y / indices.length,
    };
  };

  const computeLinearMapping = (
    samples: Array<{
      gaze: { x: number; y: number };
      target: { x: number; y: number };
    }>,
  ): EyeMapping => {
    const n = samples.length;
    if (n < 3) {
      return null;
    }

    let sumGx = 0;
    let sumGy = 0;
    let sumTx = 0;
    let sumTy = 0;
    let sumGxTx = 0;
    let sumGyTy = 0;
    let sumGx2 = 0;
    let sumGy2 = 0;

    samples.forEach(({ gaze, target }) => {
      sumGx += gaze.x;
      sumGy += gaze.y;
      sumTx += target.x;
      sumTy += target.y;
      sumGxTx += gaze.x * target.x;
      sumGyTy += gaze.y * target.y;
      sumGx2 += gaze.x * gaze.x;
      sumGy2 += gaze.y * gaze.y;
    });

    const denomX = n * sumGx2 - sumGx * sumGx;
    const denomY = n * sumGy2 - sumGy * sumGy;
    if (denomX === 0 || denomY === 0) {
      return null;
    }

    const ax = (n * sumGxTx - sumGx * sumTx) / denomX;
    const bx = (sumTx - ax * sumGx) / n;
    const ay = (n * sumGyTy - sumGy * sumTy) / denomY;
    const by = (sumTy - ay * sumGy) / n;

    const mappedXs = samples.map(({ gaze }) => ax * gaze.x + bx);
    const mappedYs = samples.map(({ gaze }) => ay * gaze.y + by);
    const minMappedX = Math.min(...mappedXs);
    const maxMappedX = Math.max(...mappedXs);
    const minMappedY = Math.min(...mappedYs);
    const maxMappedY = Math.max(...mappedYs);

    return {
      ax,
      bx,
      ay,
      by,
      minMappedX,
      maxMappedX,
      minMappedY,
      maxMappedY,
    };
  };

  const applyMapping = (
    mapping: EyeMapping,
    gaze: { x: number; y: number },
  ) => {
    if (!mapping) {
      return null;
    }

    const rawX = mapping.ax * gaze.x + mapping.bx;
    const rawY = mapping.ay * gaze.y + mapping.by;

    const xSpan = Math.max(0.05, mapping.maxMappedX - mapping.minMappedX);
    const ySpan = Math.max(0.05, mapping.maxMappedY - mapping.minMappedY);

    return {
      x: clamp01((rawX - mapping.minMappedX) / xSpan),
      y: clamp01((rawY - mapping.minMappedY) / ySpan),
    };
  };

  const finalizeCalibrationPoint = (
    index: number,
    samples: Array<{ x: number; y: number }>,
  ) => {
    if (samples.length < CALIBRATION_SAMPLE_MIN) {
      setEyeStatusText("Calibration failed: hold gaze steady and retry");
      pendingCalibrationRef.current = null;
      return;
    }

    const sum = samples.reduce(
      (acc, sample) => {
        acc.x += sample.x;
        acc.y += sample.y;
        return acc;
      },
      { x: 0, y: 0 },
    );
    const averaged = {
      x: sum.x / samples.length,
      y: sum.y / samples.length,
    };

    setCalibrationSamples((prev) => {
      const next = [...prev];
      next[index] = averaged;
      return next;
    });
    calibrationSamplesRef.current[index] = averaged;

    if (index >= CALIBRATION_POINTS.length - 1) {
      setIsCalibrating(false);
      const pairs = CALIBRATION_POINTS.map((point, idx) => {
        const sample = calibrationSamplesRef.current[idx];
        return sample ? { gaze: sample, target: point } : null;
      }).filter(
        (
          pair,
        ): pair is {
          gaze: { x: number; y: number };
          target: { x: number; y: number };
        } => pair !== null,
      );
      const mapping = computeLinearMapping(pairs);
      eyeMappingRef.current = mapping;
      setEyeStatusText(
        mapping ? "Calibration complete" : "Calibration failed: retry",
      );
    } else {
      setCalibrationIndex(index + 1);
      setEyeStatusText("Calibration: click the next dot");
    }

    pendingCalibrationRef.current = null;
  };

  const stopEyeTracking = useCallback((): void => {
    if (!isEyeActiveRef.current) {
      return;
    }

    if (eyeRafRef.current !== null) {
      cancelAnimationFrame(eyeRafRef.current);
      eyeRafRef.current = null;
    }

    if (eyeStreamRef.current) {
      eyeStreamRef.current.getTracks().forEach((track) => track.stop());
      eyeStreamRef.current = null;
    }

    if (eyeVideoRef.current) {
      eyeVideoRef.current.pause();
      eyeVideoRef.current.srcObject = null;
    }

    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }

    isEyeActiveRef.current = false;
    setIsEyeActive(false);
    setEyeStatusText("Stopped");
    setLastGaze(null);
    setIsCalibrating(false);
    setCalibrationIndex(0);
    setCalibrationSamples([]);
    eyeMappingRef.current = null;
    smoothedGazeRef.current = null;
    void sendToActiveTab({ source: "eye-tracking", type: "CALIBRATION_STOP" });
  }, [sendToActiveTab]);

  const startEyeTracking = useCallback(async (): Promise<void> => {
    if (isEyeActiveRef.current) {
      return;
    }

    setEyeStatusText("Checking camera access…");

    let cameraAllowed = false;
    try {
      const perm = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      cameraAllowed = perm.state === "granted";
    } catch {
      /* Permissions API may not support camera query in this context */
    }

    if (!cameraAllowed) {
      setEyeStatusText("Requesting camera permission…");
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
      setEyeStatusText("Camera access denied. Grant permission and retry.");
      return;
    }

    setEyeStatusText("Starting eye tracking...");

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

      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        },
      );

      if (!eyeVideoRef.current) {
        throw new Error("Video element missing");
      }

      eyeStreamRef.current = stream;
      eyeVideoRef.current.srcObject = stream;
      await eyeVideoRef.current.play();

      isEyeActiveRef.current = true;
      setIsEyeActive(true);
      setEyeStatusText("Tracking gaze (calibration next)");
      smoothedGazeRef.current = null;

      const detectLoop = async (): Promise<void> => {
        if (
          !isEyeActiveRef.current ||
          !faceLandmarkerRef.current ||
          !eyeVideoRef.current
        ) {
          return;
        }

        const now = Date.now();
        const result = faceLandmarkerRef.current.detectForVideo(
          eyeVideoRef.current,
          now,
        );
        const landmarks = result.faceLandmarks?.[0];

        if (!landmarks || landmarks.length === 0) {
          setLastGaze(null);
          eyeRafRef.current = requestAnimationFrame(() => {
            void detectLoop();
          });
          return;
        }

        const leftIris = getIrisCenter(landmarks, LEFT_IRIS);
        const rightIris = getIrisCenter(landmarks, RIGHT_IRIS);

        if (leftIris && rightIris) {
          const irisX = (leftIris.x + rightIris.x) / 2;
          const irisY = (leftIris.y + rightIris.y) / 2;
          const gaze = {
            x: clamp01(1 - irisX),
            y: clamp01(irisY),
          };
          setLastGaze(gaze);

          if (pendingCalibrationRef.current) {
            const pending = pendingCalibrationRef.current;
            pending.samples.push(gaze);
            const elapsed = now - pending.startedAt;
            if (
              pending.samples.length >= CALIBRATION_SAMPLE_TARGET ||
              elapsed >= CALIBRATION_SAMPLE_WINDOW_MS
            ) {
              finalizeCalibrationPoint(pending.index, pending.samples);
            }
          }

          const nowTs = Date.now();
          if (
            eyeMappingRef.current &&
            !isCalibrating &&
            nowTs - lastEyePointTsRef.current > EYE_POINT_INTERVAL_MS
          ) {
            lastEyePointTsRef.current = nowTs;
            const mapped = applyMapping(eyeMappingRef.current, gaze);
            if (mapped) {
              const previous = smoothedGazeRef.current;
              const smoothed = previous
                ? (() => {
                    const dx = mapped.x - previous.x;
                    const dy = mapped.y - previous.y;
                    if (Math.hypot(dx, dy) < GAZE_DEADZONE) {
                      return previous;
                    }
                    return {
                      x: EMA_ALPHA * mapped.x + (1 - EMA_ALPHA) * previous.x,
                      y: EMA_ALPHA * mapped.y + (1 - EMA_ALPHA) * previous.y,
                    };
                  })()
                : mapped;
              smoothedGazeRef.current = smoothed;
              await sendToActiveTab({
                source: "eye-tracking",
                type: "GAZE_MOVE",
                payload: smoothed,
              });
            }
          }
        } else {
          setLastGaze(null);
        }

        eyeRafRef.current = requestAnimationFrame(() => {
          void detectLoop();
        });
      };

      eyeRafRef.current = requestAnimationFrame(() => {
        void detectLoop();
      });
    } catch (error) {
      if (eyeStreamRef.current) {
        eyeStreamRef.current.getTracks().forEach((track) => track.stop());
        eyeStreamRef.current = null;
      }
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
      const errorMessage = getStartupErrorMessage(error);
      setEyeStatusText(`Unable to start: ${errorMessage}`);
      setIsEyeActive(false);
      isEyeActiveRef.current = false;
      console.error("Failed to start eye tracking", error);
    }
  }, [isCalibrating, sendToActiveTab]);

  const startCalibration = (): void => {
    setCalibrationSamples([]);
    setCalibrationIndex(0);
    setIsCalibrating(true);
    setEyeStatusText("Calibration: click the dots on the page");
    eyeMappingRef.current = null;
    calibrationSamplesRef.current = [];
    pendingCalibrationRef.current = null;
    void sendToActiveTab({ source: "eye-tracking", type: "CALIBRATION_START" });
  };
  const handleCalibrationPoint = (index: number): void => {
    const gazeSample = lastGazeRef.current;
    if (!gazeSample) {
      setEyeStatusText("No gaze detected. Keep your face in view and retry.");
      return;
    }
    pendingCalibrationRef.current = {
      index,
      startedAt: Date.now(),
      samples: [gazeSample],
    };
    setEyeStatusText("Hold gaze for a moment…");
  };

  useEffect(() => {
    return () => {
      stopEyeTracking();
    };
  }, [stopEyeTracking]);

  useEffect(() => {
    const handleMessage = (message: ExtensionRuntimeMessage): void => {
      if (!message || message.source !== "eye-tracking") {
        return;
      }

      switch (message.type) {
        case "CALIBRATION_POINT": {
          if (!isCalibrating || typeof message.payload?.index !== "number") {
            return;
          }
          handleCalibrationPoint(message.payload.index);
          break;
        }
        case "CALIBRATION_DONE":
          setIsCalibrating(false);
          setEyeStatusText("Calibration captured (mapping next)");
          break;
        case "CALIBRATION_STOP":
          setIsCalibrating(false);
          setEyeStatusText("Calibration cancelled");
          break;
        default:
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isCalibrating]);

  return (
    <section role="tabpanel" aria-label="Eye tracking" className="mt-4">
      <div className="camera-shell mt-5">
        <video ref={eyeVideoRef} className="camera-feed" muted playsInline />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="metric-card">
          <p className="metric-kicker">Engine</p>
          <p className="metric-value">{isEyeActive ? "Running" : "Stopped"}</p>
        </div>
        <div className="metric-card">
          <p className="metric-kicker">Status</p>
          <p className="metric-value">{eyeStatusText}</p>
        </div>
        <div className="metric-card col-span-2">
          <p className="metric-kicker">Gaze sample</p>
          <p className="metric-value">
            {lastGaze
              ? `${Math.round(lastGaze.x * 100)}% x ${Math.round(lastGaze.y * 100)}%`
              : "None"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2 mb-4">
        {!isEyeActive ? (
          <button
            className="primary-cta w-full"
            onClick={() => void startEyeTracking()}
          >
            Start Eye Tracking
          </button>
        ) : (
          <button className="primary-cta w-full" onClick={stopEyeTracking}>
            Stop Eye Tracking
          </button>
        )}
        <button
          className="counter-btn counter-btn-primary w-full"
          onClick={() => {
            if (!isEyeActive) return;
            if (!isCalibrating) startCalibration();
            else setEyeStatusText("Click the highlighted dot on the page");
          }}
        >
          {!isCalibrating ? "Start Calibration" : "Waiting on Dot"}
        </button>
      </div>

      <p className="status-note mt-4">
        Calibration uses 9 points on the page. Look at the highlighted dot and
        click it, then hold your gaze briefly to capture multiple samples.
      </p>
    </section>
  );
};

export default EyeTrackingPanel;
