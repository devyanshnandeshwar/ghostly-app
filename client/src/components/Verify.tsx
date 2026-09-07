import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2, ScanFace } from "lucide-react";

import api from "../services/client";
import { FRAMING_HINTS, useFaceFraming } from "../hooks/useFaceFraming";
import { classifyGender } from "../lib/genderClassifier";
import { apiErrorMessage, errorText } from "../lib/apiError";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface VerifyProps {
  onVerified: () => void;
}

export function Verify({ onVerified }: VerifyProps) {
  const [loading, setLoading] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<{ kind: "camera" | "frame"; message: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureButtonRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();

  // Deliberately not `&& !loading`: keeping the loop alive during upload means
  // that the instant the server rejects a frame the user already has live
  // guidance again. The glass spinner covers the overlay meanwhile.
  const framing = useFaceFraming(videoRef, !!stream && !gender);
  const showGate = framing.status !== "idle" && framing.status !== "unavailable";

  // Take keyboard and screen-reader users to the action the moment it unlocks.
  // Deliberately not an auto-capture: the copy above promises "one frame goes to
  // the model", and verifyLimiter allows only 5 attempts a minute, so firing on a
  // marginal ready state could strand someone behind a rate-limit message.
  useEffect(() => {
    if (framing.canCapture && stream && !gender) captureButtonRef.current?.focus();
  }, [framing.canCapture, stream, gender]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    setLoading(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError({ kind: "camera", message: "This browser cannot open a camera. Try a recent Chrome, Firefox or Safari." });
      setLoading(false);
      return;
    }

    try {
      setError(null);
      // A bare value is treated as `ideal`, so a single-camera desktop will not
      // throw OverconstrainedError. No width/height: capture already downscales to
      // 640, and pinning resolution can push the UA into its own scale/crop path.
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch((e) => console.error("[Verify] Play error:", e));
      }
    } catch (err) {
      console.error("[Verify] Camera error:", err);
      const errorMsg = errorText(err, "Unknown error");

      if (errorMsg.includes("Permission")) {
        setError({
          kind: "camera",
          message: "Camera access was blocked. Allow it from the icon in your address bar, then try again.",
        });
      } else if (errorMsg.includes("NotFound") || errorMsg.includes("DeviceNotFound")) {
        setError({ kind: "camera", message: "No camera was found on this device." });
      } else {
        setError({ kind: "camera", message: errorMsg });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    // Defence against the keyboard path; the button is already disabled.
    if (!framing.canCapture) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    const box = framing.faceBoxRef.current;

    if (!box) {
      setError({ kind: "frame", message: "Lost track of your face. Line up again and retry." });
      return;
    }

    // Crop to the face plus a margin. The classifier wants a little context
    // around the face rather than a tight box -- 20px at 640 is the same padding
    // the old server-side detector used before its 227x227 resize, scaled here
    // to whatever resolution the camera actually gave us.
    const pad = 20 * (Math.max(video.videoWidth, video.videoHeight) / 640);
    const sx = Math.max(0, box.originX - pad);
    const sy = Math.max(0, box.originY - pad);
    const sw = Math.min(video.videoWidth - sx, box.width + pad * 2);
    const sh = Math.min(video.videoHeight - sy, box.height + pad * 2);

    if (sw <= 0 || sh <= 0) {
      setError({ kind: "frame", message: "That frame did not work. Line up again and retry." });
      return;
    }

    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    await submitGender(canvas);
  };

  const submitGender = async (canvas: HTMLCanvasElement) => {
    setLoading(true);
    setError(null);

    try {
      const result = await classifyGender(canvas);

      // The frame has been read; drop it immediately. It never left the device,
      // and it should not sit in a canvas any longer than the one call needs it.
      canvas.width = 0;
      canvas.height = 0;

      if (!result) {
        setError({
          kind: "frame",
          message: "Could not read that frame. Try again with more light.",
        });
        return;
      }

      // Only the label goes over the wire -- never the image.
      const response = await api.post("/verify/gender", {
        gender: result.gender,
        confidence: result.confidence,
      });

      setGender(response.data.gender);

      // Stop camera on success
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }

      setTimeout(() => {
        onVerified();
      }, 1500);
    } catch (err) {
      console.error("[Verify] Error:", err);
      // Surface the server's reason (e.g. low confidence, rejected value).
      setError({
        kind: "frame",
        message: apiErrorMessage(err, "That frame did not work. Try again with more light."),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 elevation-mid sm:p-8">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ScanFace className="size-6 text-primary" />
          Verify with your camera
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Your camera frame is read on this device and never uploaded. Only the result
          is sent, and the image is discarded straight after.
        </p>
      </div>

      <div className="relative mx-auto aspect-3/4 max-h-[26rem] w-full overflow-hidden rounded-xl border bg-secondary">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`size-full scale-x-[-1] object-cover transition-opacity duration-300 ${
            stream ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Idle: say what the camera is for before asking for it. */}
        {!stream && !gender && (
          <div className="absolute inset-0 grid place-items-center px-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="glass grid size-14 place-items-center rounded-full border">
                <Camera className="size-6 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">
                Face a light source and keep your whole face in frame.
              </p>
            </div>
          </div>
        )}

        {/* Live: a framing guide, so the user knows where to put their face.
            Sized to the pass zone (~0.20 of the preview area, centred a little
            above the middle) rather than the old inset-4, which was ~85% of the
            area -- filling that landed in `too-close` and fought the gate. */}
        {stream && !gender && (
          <div className="pointer-events-none absolute inset-0">
            <span
              className={`absolute inset-x-[30%] top-[21%] bottom-[29%] rounded-[45%] border-2 transition-colors duration-300 ${
                framing.status === "ready" ? "border-success/70" : "border-primary/45"
              }`}
            />

            {showGate && !loading && (
              <div
                id={hintId}
                role="status"
                aria-live="polite"
                className="glass-panel absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border px-4 py-2 text-center text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                {FRAMING_HINTS[framing.status]}
                {framing.lowLight && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    More light would help
                  </span>
                )}
              </div>
            )}
            {loading && (
              <span className="glass absolute inset-0 grid place-items-center">
                <span className="flex flex-col items-center gap-2 text-primary">
                  <Loader2 className="size-6 animate-spin" />
                  <span className="text-sm font-medium">Checking the frame</span>
                </span>
              </span>
            )}
          </div>
        )}

        {/* Verified. */}
        {gender && (
          <div className="absolute inset-0 grid place-items-center bg-card animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-2 text-success">
              <CheckCircle2 className="size-12 animate-settle" />
              <p className="text-lg font-semibold capitalize">Verified as {gender}</p>
              <p className="text-sm text-muted-foreground">Taking you to matching</p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {framing.bypass === "timeout" && !error && (
        <Alert className="mt-4">
          <AlertCircle className="size-4" />
          <AlertTitle>We still cannot see a face</AlertTitle>
          <AlertDescription>
            Try more light, or move so your whole face is inside the oval. Verification
            needs to actually see you.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="size-4" />
          <AlertTitle>
            {error.kind === "camera" ? "Camera unavailable" : "That frame did not pass"}
          </AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="mt-5">
        {!stream && !gender && (
          <Button onClick={startCamera} disabled={loading} className="h-12 w-full gap-2 text-base">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            {loading ? "Opening camera" : error ? "Try again" : "Enable camera"}
          </Button>
        )}

        {stream && !gender && (
          <Button
            ref={captureButtonRef}
            onClick={() => void handleCapture()}
            disabled={loading || !framing.canCapture}
            aria-describedby={showGate ? hintId : undefined}
            className="h-12 w-full text-base"
          >
            {loading
              ? "Checking"
              : framing.status === "loading"
                ? "Getting ready"
                : "Capture and verify"}
          </Button>
        )}
      </div>
    </div>
  );
}
