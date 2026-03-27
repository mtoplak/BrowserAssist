import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { handleGoToOptions } from "./tools/functions";
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import type {
  ExtensionRuntimeMessage,
  GestureAction,
  GestureRuntimeMessage,
} from "./tools/gestureTypes";
import "./index.css";

const ACTION_COOLDOWN_MS = 750;
const POINT_FRAME_INTERVAL_MS = 75;
const EYE_POINT_INTERVAL_MS = 75;
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

type PopupTab = "gesture" | "eye";
type EyeGazeSample = { x: number; y: number } | null;
type EyeMapping = { ax: number; bx: number; ay: number; by: number } | null;

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PopupTab>("gesture");
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("Idle");
  const [lastGesture, setLastGesture] = useState<string>("None");
  const [isEyeActive, setIsEyeActive] = useState<boolean>(false);
  const [eyeStatusText, setEyeStatusText] = useState<string>("Idle");
  const [lastGaze, setLastGaze] = useState<EyeGazeSample>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationIndex, setCalibrationIndex] = useState<number>(0);
  const [calibrationSamples, setCalibrationSamples] = useState<
    Array<EyeGazeSample>
  >([]);
  const lastGazeRef = useRef<EyeGazeSample>(null);
  const eyeMappingRef = useRef<EyeMapping>(null);
  const calibrationSamplesRef = useRef<Array<EyeGazeSample>>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const eyeVideoRef = useRef<HTMLVideoElement | null>(null);
  const eyeStreamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const eyeRafRef = useRef<number | null>(null);
  const isActiveRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isEyeActiveRef = useRef<boolean>(false);
  const lastEyePointTsRef = useRef<number>(0);
  const lastActionTsRef = useRef<number>(0);
  const lastPointTsRef = useRef<number>(0);
  const wristHistoryRef = useRef<Array<{ x: number; y: number; t: number }>>(
    [],
  );
  const previousPinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    lastGazeRef.current = lastGaze;
  }, [lastGaze]);

  const computeLinearMapping = (
    samples: Array<{ gaze: { x: number; y: number }; target: { x: number; y: number } }>,
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

    return { ax, bx, ay, by };
  };

  const applyMapping = (mapping: EyeMapping, gaze: { x: number; y: number }) => {
    if (!mapping) {
      return null;
    }
    return {
      x: clamp01(mapping.ax * gaze.x + mapping.bx),
      y: clamp01(mapping.ay * gaze.y + mapping.by),
    };
  };

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

    setEyeStatusText("Starting eye tracking…");

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

          const now = Date.now();
          if (
            eyeMappingRef.current &&
            !isCalibrating &&
            now - lastEyePointTsRef.current > EYE_POINT_INTERVAL_MS
          ) {
            lastEyePointTsRef.current = now;
            const mapped = applyMapping(eyeMappingRef.current, gaze);
            if (mapped) {
              await sendToActiveTab({
                source: "eye-tracking",
                type: "GAZE_MOVE",
                payload: mapped,
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
  }, []);

  const startCalibration = (): void => {
    setCalibrationSamples([]);
    setCalibrationIndex(0);
    setIsCalibrating(true);
    setEyeStatusText("Calibration: click the dots on the page");
    eyeMappingRef.current = null;
    calibrationSamplesRef.current = [];
    void sendToActiveTab({ source: "eye-tracking", type: "CALIBRATION_START" });
  };

  const handleCalibrationPoint = (index: number): void => {
    const gazeSample = lastGazeRef.current;
    if (!gazeSample) {
      return;
    }
    setCalibrationSamples((prev) => {
      const next = [...prev];
      next[index] = gazeSample;
      return next;
    });
    calibrationSamplesRef.current[index] = gazeSample;
    if (index >= CALIBRATION_POINTS.length - 1) {
      setIsCalibrating(false);
      const pairs = CALIBRATION_POINTS.map((point, idx) => {
        const sample = calibrationSamplesRef.current[idx];
        return sample ? { gaze: sample, target: point } : null;
      }).filter(
        (pair): pair is { gaze: { x: number; y: number }; target: { x: number; y: number } } =>
          pair !== null,
      );
      const mapping = computeLinearMapping(pairs);
      eyeMappingRef.current = mapping;
      setEyeStatusText(mapping ? "Calibration complete" : "Calibration failed: retry");
    } else {
      setCalibrationIndex(index + 1);
    }
  };


  useEffect(() => {
    return () => {
      void stopEngine();
      stopEyeTracking();
    };
  }, [stopEngine, stopEyeTracking]);

  useEffect(() => {
    if (activeTab !== "eye" && isEyeActiveRef.current) {
      stopEyeTracking();
    }
  }, [activeTab, stopEyeTracking]);

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
        <h1 className="hero-title mt-3">Assistive Control Panel</h1>
        <p className="hero-copy mt-3">
          Choose a control mode for this session. All processing stays on your
          device.
        </p>

        <div className="tab-bar mt-5" role="tablist">
          <button
            className={`tab-btn ${activeTab === "gesture" ? "tab-btn-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "gesture"}
            onClick={() => setActiveTab("gesture")}
          >
            Gesture Control
          </button>
          <button
            className={`tab-btn ${activeTab === "eye" ? "tab-btn-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "eye"}
            onClick={() => setActiveTab("eye")}
          >
            Eye Tracking
          </button>
        </div>

        {activeTab === "gesture" ? (
          <section role="tabpanel" aria-label="Gesture control" className="mt-4">
            <p className="hero-copy mt-2">
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

            <p className="status-note mt-4">
              Gestures: swipe left/right, swipe up/down, pinch in/out, point +
              dwell, open palm to pause.
            </p>
          </section>
        ) : (
          <section role="tabpanel" aria-label="Eye tracking" className="mt-4">
            <div className="eyetrack-shell">
              <p className="metric-kicker">Eye tracking</p>
              <p className="hero-copy mt-2">
                This mode uses MediaPipe face landmarks to estimate gaze. We
                will add calibration and pointer control next.
              </p>

              <div className="camera-shell mt-5">
                <video ref={eyeVideoRef} className="camera-feed" muted playsInline />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="metric-card">
                  <p className="metric-kicker">Engine</p>
                  <p className="metric-value">
                    {isEyeActive ? "Running" : "Stopped"}
                  </p>
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

              <div className="mt-6 flex gap-2">
                {!isEyeActive ? (
                  <button
                    className="primary-cta w-full"
                    onClick={() => void startEyeTracking()}
                  >
                    Start Eye Tracking
                  </button>
                ) : (
                  <button
                    className="primary-cta w-full"
                    onClick={stopEyeTracking}
                  >
                    Stop Eye Tracking
                  </button>
                )}
                <button
                  className="counter-btn counter-btn-primary"
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
                Calibration uses 9 points on the page. Look at the highlighted
                dot and click it to capture.
              </p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<App />);
