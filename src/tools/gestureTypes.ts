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
