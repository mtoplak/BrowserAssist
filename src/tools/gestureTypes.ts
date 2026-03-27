export type GestureAction =
    | "SWIPE_LEFT"
    | "SWIPE_RIGHT"
    | "SCROLL_UP"
    | "SCROLL_DOWN"
    | "PINCH_IN"
    | "PINCH_OUT"
    | "POINT_MOVE"
    | "POINT_IDLE"
    | "PAUSED"
    | "RESUMED";

export type EyeAction =
    | "CALIBRATION_START"
    | "CALIBRATION_STOP"
    | "CALIBRATION_POINT"
    | "CALIBRATION_DONE"
    | "GAZE_MOVE";

export interface GestureRuntimeMessage {
    source: "gesture-engine";
    type: GestureAction;
    payload?: {
        x?: number;
        y?: number;
        confidence?: number;
        label?: string;
    };
}

export interface EyeRuntimeMessage {
    source: "eye-tracking";
    type: EyeAction;
    payload?: {
        index?: number;
        x?: number;
        y?: number;
    };
}

export type ExtensionRuntimeMessage = GestureRuntimeMessage | EyeRuntimeMessage;
