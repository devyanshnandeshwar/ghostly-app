import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { BoundingBox, Detection, FaceDetector } from "@mediapipe/tasks-vision";

/**
 * Client-side face framing gate for the verification camera.
 *
 * This decides only WHEN a frame is worth uploading. It never decides anything
 * about the person in it -- gender inference stays entirely server-side, and the
 * client still uploads a JPEG for the server to grade. Moving that decision here
 * would let anyone POST their own verdict, which is the whole point of the check.
 *
 * The gate is deliberately conservative: it judges the visible (cropped) preview
 * while `handleCapture` uploads the full frame, so the server always sees at
 * least as much as the user did.
 */

// Vendored from @mediapipe/tasks-vision@1.0.1. The version is load-bearing: the
// bundled vision_bundle.mjs must match the wasm on disk, which is why the
// dependency is pinned exactly (no caret) in package.json. BASE_URL rather than
// a leading "/" because VITE_BASE_PATH is a build arg.
const ASSET_BASE = `${import.meta.env.BASE_URL}mediapipe/1.0.1/`;
const WASM_LOADER_PATH = `${ASSET_BASE}vision_wasm_internal.js`;
const WASM_BINARY_PATH = `${ASSET_BASE}vision_wasm_internal.wasm`;
const MODEL_ASSET_PATH = `${ASSET_BASE}blaze_face_short_range.tflite`;

// Built inline instead of via FilesetResolver.forVisionTasks(): the resolver
// runtime-probes SIMD and may ask for either the SIMD or the no-SIMD pair, which
// would mean vendoring all four files (23.4MB) for a fallback no browser that can
// run getUserMedia still needs. A no-SIMD browser throws into the fail-open path,
// which is the right outcome there anyway.
const WASM_FILESET = {
    wasmLoaderPath: WASM_LOADER_PATH,
    wasmBinaryPath: WASM_BINARY_PATH
};

// Derived from the upload chain, not guessed. handleCapture caps the long edge at
// 640, then the server pads the face box by 20px and resizes to 227x227. At 0.09
// the worst case (a 1280x720 stream, which capture halves) still only upsamples
// ~1.45x to reach 227; at 0.06 it degrades to ~1.9x.
const MIN_AREA_RATIO = 0.09;
const MAX_AREA_RATIO = 0.4; // beyond this the server's 20px pad clips chin/forehead
const TARGET_Y = 0.46; // heads sit above geometric centre in portrait framing
const CENTRE_TOL_X = 0.16;
const CENTRE_TOL_Y = 0.18; // looser: vertical seating position varies more
// BlazeFace and the server's res10 SSD are different models so the scores are not
// literally comparable, but anchoring to detection.py's own conf_threshold=0.7 is
// at least non-arbitrary.
const MIN_SCORE = 0.7;
const MULTI_FACE_SCORE = 0.5; // lower bar for counting bystanders
const FPS = 10; // BlazeFace on CPU is 5-15ms desktop, 20-40ms mid-range mobile
const FRAME_INTERVAL_MS = 1000 / FPS;
const ARM_TICKS = 5; // 0.5s of consecutive ready before the button unlocks
const DISARM_TICKS = 3; // asymmetric hysteresis: one dropped frame must not flick it off
const BYPASS_TICKS = FPS * 8; // ~8s of live ticks before the escape hatch opens
const LUMA_EVERY = 10; // sample brightness at 1Hz
const LUMA_SIZE = 32;
const LUMA_DARK_MEAN = 55;
const LUMA_FLAT_STDDEV = 20;

export type FramingStatus =
    | "idle"
    | "loading"
    | "unavailable"
    | "no-face"
    | "multiple-faces"
    | "too-far"
    | "too-close"
    | "off-centre"
    | "ready";

export type FramingBypass = "none" | "unavailable" | "timeout";

export interface FaceFramingState {
    status: FramingStatus;
    canCapture: boolean;
    bypass: FramingBypass;
    /** Advisory only. Deliberately never blocks capture -- see the note below. */
    lowLight: boolean;
    /**
     * Latest primary face box, in the video's intrinsic pixels, for cropping at
     * capture time. A ref rather than state on purpose: this changes on every
     * one of the ~10 ticks a second and nothing renders from it, so putting it
     * in state would re-render the whole component at 10Hz for no reason.
     */
    faceBoxRef: RefObject<BoundingBox | null>;
}

// Typed as Record<FramingStatus, string> on purpose: adding a status without copy
// becomes a compile error rather than a blank pill.
export const FRAMING_HINTS: Record<FramingStatus, string> = {
    idle: "",
    loading: "Getting the camera check ready",
    unavailable: "",
    "no-face": "Looking for your face",
    "multiple-faces": "Only you should be in frame",
    "too-far": "Move a little closer",
    "too-close": "Move back slightly",
    "off-centre": "Centre your face in the oval",
    ready: "Hold still"
};

let preloadPromise: Promise<void> | null = null;

/**
 * Warms the HTTP cache for the detector so the verification step does not stall
 * on a ~3.4MB (gzip) download at the least forgiving moment in onboarding.
 * Idempotent, and every failure is swallowed -- this is best-effort only, and the
 * hook fails open if it did not land.
 */
export function preloadFaceFraming(): Promise<void> {
    if (!preloadPromise) {
        preloadPromise = (async () => {
            await import("@mediapipe/tasks-vision");
            await Promise.all([
                fetch(WASM_BINARY_PATH, { cache: "force-cache" }),
                fetch(MODEL_ASSET_PATH, { cache: "force-cache" })
            ]);
        })().catch((err) => {
            console.warn("[useFaceFraming] preload skipped:", err);
        });
    }

    return preloadPromise;
}

export interface Framing {
    status: FramingStatus;
    /** The primary face in the video's intrinsic pixels, for the luma sampler. */
    raw: BoundingBox | null;
}

/**
 * Maps detections (in the video's intrinsic pixels) onto what the user actually
 * sees, then grades the framing.
 *
 * Two transforms sit between the two spaces and both matter:
 *   - object-cover crops the stream. Which axis gets cropped flips with
 *     orientation: 640x480 into a 384x416 box hides 31% of the width, while
 *     720x1280 into 295x393 hides 25% of the height.
 *   - scale-x-[-1] mirrors the preview, so a sibling overlay is not mirrored.
 *
 * The container is measured rather than assumed: `aspect-3/4 max-h-[26rem] w-full`
 * renders 295x393 (0.75) on a 375px phone but 384x416 (0.92) from `sm` up, because
 * max-height clamps without shrinking the width.
 */
export function gradeFraming(
    detections: Detection[],
    vw: number,
    vh: number,
    cw: number,
    ch: number
): Framing {
    if (!vw || !vh || !cw || !ch) return { status: "no-face", raw: null };

    // Counted on the raw list, before any crop clipping: a bystander cropped out
    // of the preview is still in the uploaded JPEG, where detection.py may pick
    // them as faceBoxes[0].
    const faces = detections.filter((d) => d.boundingBox && score(d) >= MULTI_FACE_SCORE);

    if (faces.length === 0) return { status: "no-face", raw: null };
    if (faces.length > 1) return { status: "multiple-faces", raw: null };

    const primary = faces[0];
    if (score(primary) < MIN_SCORE) return { status: "no-face", raw: null };

    const b = primary.boundingBox!;

    // object-cover: scale to fill, crop the overflow symmetrically (object-position
    // is at its default 50% 50%).
    const s = Math.max(cw / vw, ch / vh);
    const cropX = (vw - cw / s) / 2;
    const cropY = (vh - ch / s) / 2;

    const wCss = b.width * s;
    const hCss = b.height * s;
    const yCss = (b.originY - cropY) * s;
    // Undo the mirror so "centred" is judged against what the user is steering.
    // |dx| is actually mirror-invariant, but any direction wording added later
    // must come from these coordinates.
    const xDisplay = cw - ((b.originX - cropX) * s + wCss);

    // Measured against the displayed box, not the raw frame: a 100px face is 15.6%
    // of a 640-wide stream but 22.6% of the 443px the user can actually see, so
    // raw-frame thresholds would drift with every camera.
    const areaRatio = (wCss * hCss) / (cw * ch);

    // Checked before the bounds test on purpose. Someone leaning right into the
    // lens overflows the preview, so an inFrame-first order would tell them to
    // centre their face -- advice that cannot fix it, leaving them stuck until the
    // escape hatch opens. Overflow is the expected symptom of too-close, not a
    // separate problem.
    if (areaRatio > MAX_AREA_RATIO) return { status: "too-close", raw: b };

    // BlazeFace happily finds faces in the third of the stream object-cover hides.
    const inFrame =
        xDisplay >= -0.02 * cw &&
        yCss >= -0.02 * ch &&
        xDisplay + wCss <= 1.02 * cw &&
        yCss + hCss <= 1.02 * ch;

    if (!inFrame) return { status: "off-centre", raw: b };

    if (areaRatio < MIN_AREA_RATIO) return { status: "too-far", raw: b };

    const dx = (xDisplay + wCss / 2) / cw - 0.5;
    const dy = (yCss + hCss / 2) / ch - TARGET_Y;

    if (Math.abs(dx) > CENTRE_TOL_X || Math.abs(dy) > CENTRE_TOL_Y) {
        return { status: "off-centre", raw: b };
    }

    return { status: "ready", raw: b };
}

/** Matches detection.py, which takes faceBoxes[0] from a confidence-sorted list. */
function score(d: Detection): number {
    return d.categories[0]?.score ?? 0;
}

/**
 * Underexposure check, used ONLY as an advisory hint.
 *
 * It tests for flat AND dark rather than merely dark, because raw brightness is a
 * skin-tone proxy: a dark-skinned face in good light is dark but retains normal
 * local contrast. Blocking capture on this would gate dark-skinned users
 * disproportionately, so it never gates -- it only adds a line of copy.
 */
function isLowLight(
    video: HTMLVideoElement,
    b: BoundingBox,
    ctx: CanvasRenderingContext2D
): boolean {
    const sx = Math.max(0, b.originX);
    const sy = Math.max(0, b.originY);
    const sw = Math.min(b.width, video.videoWidth - sx);
    const sh = Math.min(b.height, video.videoHeight - sy);

    if (sw <= 0 || sh <= 0) return false;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, LUMA_SIZE, LUMA_SIZE);
    const { data } = ctx.getImageData(0, 0, LUMA_SIZE, LUMA_SIZE);

    let sum = 0;
    let sumSq = 0;
    const n = LUMA_SIZE * LUMA_SIZE;

    for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += luma;
        sumSq += luma * luma;
    }

    const mean = sum / n;
    const stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

    return mean < LUMA_DARK_MEAN && stddev < LUMA_FLAT_STDDEV;
}

export function useFaceFraming(
    videoRef: RefObject<HTMLVideoElement | null>,
    enabled: boolean
): FaceFramingState {
    // Three primitives rather than one object: React bails out on Object.is, so an
    // unchanged status costs zero renders. This is what stops a 10Hz detection loop
    // from becoming a 10Hz render loop.
    const [status, setStatus] = useState<FramingStatus>("idle");
    const [bypass, setBypass] = useState<FramingBypass>("none");
    const [lowLight, setLowLight] = useState(false);
    // Separate from `status`: the hysteresis below, not the raw verdict, is what
    // unlocks the button.
    const [captureArmed, setCaptureArmed] = useState(false);
    const faceBoxRef = useRef<BoundingBox | null>(null);

    useEffect(() => {
        if (!enabled) {
            setStatus("idle");
            setBypass("none");
            setLowLight(false);
            setCaptureArmed(false);
            faceBoxRef.current = null;
            return;
        }

        // One token per effect run, closed over by this run's cleanup. Deliberately
        // NOT a ref: under StrictMode a shared ref would let run 1's cleanup cancel
        // run 2's detector.
        const run = { cancelled: false };
        let detector: FaceDetector | null = null;
        let rafId = 0;
        let lastTimestamp = 0;
        let lastRun = 0;
        let readyTicks = 0;
        let unreadyTicks = 0;
        let strugglingTicks = 0;
        let lumaTick = 0;
        let armed = false;

        // Owned by the hook. Never canvasRef -- handleCapture resizes that one, and
        // sharing it would be a race.
        const lumaCanvas = document.createElement("canvas");
        lumaCanvas.width = LUMA_SIZE;
        lumaCanvas.height = LUMA_SIZE;
        const lumaCtx = lumaCanvas.getContext("2d", { willReadFrequently: true });

        setStatus("loading");

        const step = () => {
            const video = videoRef.current;

            // detectForVideo on a zero-dimension video throws.
            if (!video || video.readyState < 2 || video.videoWidth === 0) return;
            if (document.hidden) return;

            const now = performance.now();
            if (now - lastRun < FRAME_INTERVAL_MS) return;
            lastRun = now;

            // Must strictly increase for the lifetime of this detector instance.
            const timestamp = Math.max(lastTimestamp + 1, Math.round(now));
            lastTimestamp = timestamp;

            // Synchronous: returns a DetectionResult, not a Promise, so there is no
            // async race inside the loop.
            const result = detector!.detectForVideo(video, timestamp);
            const { status: next, raw } = gradeFraming(
                result.detections,
                video.videoWidth,
                video.videoHeight,
                video.clientWidth,
                video.clientHeight
            );

            if (next === "ready") {
                readyTicks += 1;
                unreadyTicks = 0;
                if (!armed && readyTicks >= ARM_TICKS) armed = true;
            } else {
                unreadyTicks += 1;
                readyTicks = 0;
                if (armed && unreadyTicks >= DISARM_TICKS) armed = false;
            }

            // Counted in live ticks rather than wall clock: a setTimeout would keep
            // running while the tab is hidden and arm the bypass for someone who was
            // never actually struggling. Latched once open -- never re-lock a button
            // the user has already been given.
            if (!armed) {
                strugglingTicks += 1;
                if (strugglingTicks >= BYPASS_TICKS) setBypass("timeout");
            } else {
                strugglingTicks = 0;
            }

            faceBoxRef.current = raw;

            // Reporting `ready` whenever armed keeps the pill and the button in
            // agreement, including through the disarm window.
            setStatus(armed ? "ready" : next);
            setCaptureArmed(armed);

            lumaTick = (lumaTick + 1) % LUMA_EVERY;
            if (lumaTick === 0 && lumaCtx) {
                setLowLight(raw ? isLowLight(video, raw, lumaCtx) : false);
            }
        };

        const tick = () => {
            if (run.cancelled) return;

            try {
                step();
            } catch (err) {
                console.warn("[useFaceFraming] detection tick failed:", err);
            }

            if (!run.cancelled) rafId = requestAnimationFrame(tick);
        };

        void (async () => {
            try {
                const vision = await import("@mediapipe/tasks-vision");
                if (run.cancelled) return;

                const created = await vision.FaceDetector.createFromOptions(WASM_FILESET, {
                    baseOptions: {
                        modelAssetPath: MODEL_ASSET_PATH,
                        // CPU, not GPU: the model is 224KB at 128x128, so XNNPACK beats the
                        // cost of a texture round trip, and a lost WebGL context on iOS
                        // Safari would be a brand new way to strand someone in the one flow
                        // that must never lock anyone out.
                        delegate: "CPU"
                    },
                    runningMode: "VIDEO",
                    // Left at 0.5 and gated at MIN_SCORE ourselves. Setting the detector to
                    // 0.7 would erase the difference between "no face" and "a weak
                    // detection", and would undercount bystanders.
                    minDetectionConfidence: 0.5
                });

                // The load-bearing line: cleanup ran before `detector` was assigned, so
                // without this the first StrictMode detector leaks its wasm heap.
                if (run.cancelled) {
                    created.close();
                    return;
                }

                console.log("[useFaceFraming] detector ready");
                detector = created;
                rafId = requestAnimationFrame(tick);
            } catch (err) {
                if (run.cancelled) return;
                // Fail open. Everything that could go wrong here -- blocked assets, no
                // SIMD, no wasm -- must leave the user exactly where they were before
                // this feature existed.
                console.warn("[useFaceFraming] detector unavailable, failing open:", err);
                setStatus("unavailable");
                setBypass("unavailable");
            }
        })();

        // Note: we deliberately do NOT use the cross-remount initRef guard from
        // useChatHook.ts. For a detector holding an 11.7MB wasm heap that is a real
        // leak in dev, and it would break re-arming when the camera restarts.
        return () => {
            run.cancelled = true;
            cancelAnimationFrame(rafId);
            detector?.close(); // close() is not safe to call twice
            detector = null;
        };
    }, [enabled, videoRef]);

    return {
        status,
        bypass,
        lowLight,
        faceBoxRef,
        // Only the "unavailable" bypass opens the gate. That one means the
        // detector never ran -- blocked assets, no wasm, no SIMD -- and
        // refusing capture there would lock out a browser for a failure that is
        // ours, not the user's.
        //
        // "timeout" is the opposite case: the detector DID run and saw no face
        // for eight seconds. Treating that as permission meant covering the
        // camera and waiting was a complete bypass of the gate, needing no
        // devtools -- and the classifier has no "not a face" class, so it
        // answers confidently for a wall. Failing closed here is the whole
        // point of having a gate.
        canCapture: captureArmed || bypass === "unavailable"
    };
}
