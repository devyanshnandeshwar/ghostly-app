import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2, ScanFace } from "lucide-react";

import api from "../services/client";
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
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch((e) => console.error("[Verify] Play error:", e));
      }
    } catch (err: any) {
      console.error("[Verify] Camera error:", err);
      const errorMsg = err?.message || err?.name || "Unknown error";

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

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    // Downscale before upload. The face detector runs at 300x300 and the
    // gender model at 227x227, so a full-resolution frame is bytes on the
    // wire that the model never looks at.
    const MAX_EDGE = 640;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));

    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        await uploadImage(blob);
      },
      "image/jpeg",
      0.85
    );
  };

  const uploadImage = async (blob: Blob) => {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("image", blob, "capture.jpg");

    try {
      const response = await api.post("/verify/gender", formData, {
        headers: { "Content-Type": "multipart/form-data" },
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
    } catch (err: any) {
      console.error("[Verify] Error:", err);
      // Surface the server's reason (e.g. low confidence, no face detected).
      setError({
        kind: "frame",
        message: err.response?.data?.error || "That frame did not work. Try again with more light.",
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
          One frame goes to the model, which returns a gender and then discards the image.
          Nothing is saved and nobody sees it.
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

        {/* Live: a framing guide, so the user knows where to put their face. */}
        {stream && !gender && (
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute inset-4 rounded-lg border-2 border-primary/45" />
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
          <Button onClick={handleCapture} disabled={loading} className="h-12 w-full text-base">
            {loading ? "Checking" : "Capture and verify"}
          </Button>
        )}
      </div>
    </div>
  );
}
