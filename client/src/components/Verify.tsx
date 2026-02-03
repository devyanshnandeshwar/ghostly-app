import { useState, useRef, useEffect } from "react";
import api from "../services/client";
import { getDeviceId } from "../utils/device";
import { Camera, ScanFace, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface VerifyProps {
    onVerified: () => void;
}

export function Verify({ onVerified }: VerifyProps) {
    const [loading, setLoading] = useState(false);
    const [gender, setGender] = useState<"male" | "female" | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Cleanup stream on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    const startCamera = async () => {
        console.log("[Verify] requesting camera access...");
        setLoading(true); 

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("[Verify] navigator.mediaDevices.getUserMedia is not supported");
            setError("Camera API not supported in this browser. Please use a modern browser.");
            setLoading(false);
            return;
        }

        try {
            setError(null);
            // Try simplest constraints first
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: true 
            });
            
            console.log("[Verify] Camera stream obtained:", mediaStream.id);
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch(e => console.error("[Verify] Play error:", e));
                console.log("[Verify] Video srcObject set and playing");
            }
        } catch (err: any) {
            console.error("[Verify] Camera error:", err);
            
            // Handle specific name/message properties safely
            const errorMsg = err?.message || err?.name || "Unknown error";
            
            if (errorMsg.includes("Permission")) {
                setError("Camera permission denied. Please allow access in your browser address bar.");
            } else if (errorMsg.includes("NotFound") || errorMsg.includes("DeviceNotFound")) {
                setError("No camera device found.");
            } else {
                setError(`Camera error: ${errorMsg}`);
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

        // Set dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw frame
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            await uploadImage(blob);
        }, "image/jpeg", 0.95);
    };

    const uploadImage = async (blob: Blob) => {
        setLoading(true);
        const formData = new FormData();
        formData.append("image", blob, "capture.jpg");

        try {
            const response = await api.post("/verify/gender", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    "X-Device-Id": getDeviceId()
                }
            });

            console.log("[Verify] Gender detected:", response.data.gender);
            setGender(response.data.gender);

            // Stop camera on success
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }

            setTimeout(() => {
                onVerified();
            }, 1500);

        } catch (err) {
            console.error("[Verify] Error:", err);
            setError("Verification failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto border-border/50 shadow-2xl">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl flex items-center justify-center gap-2">
                    <ScanFace className="text-primary h-6 w-6" />
                    Identity Verify
                </CardTitle>
                <CardDescription>
                    Enable camera to verify gender. No images are stored.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="relative aspect-[3/4] bg-muted rounded-xl overflow-hidden border border-border">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-300 ${!stream ? "opacity-0" : "opacity-100"}`}
                    />

                    {!stream && !gender && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
                            <div className="p-4 bg-background/50 backdrop-blur rounded-full">
                                <Camera className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </div>
                    )}
                    
                    {/* Scanning Overlay */}
                    {stream && !loading && (
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-0 border-2 border-primary/30 rounded-xl" />
                        </div>
                    )}
                    
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {loading && (
                    <div className="flex flex-col items-center gap-3 text-primary animate-in fade-in zoom-in duration-300">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-medium">Analyzing...</span>
                    </div>
                )}

                {gender && (
                    <div className="flex flex-col items-center gap-2 text-green-500 animate-in fade-in zoom-in duration-300">
                        <CheckCircle2 className="h-12 w-12" />
                        <p className="font-bold text-lg capitalize">
                            Verified: {gender}
                        </p>
                    </div>
                )}
            </CardContent>
            
            <CardFooter className="flex-col gap-3">
                 {!stream && !gender && (
                    <Button 
                        onClick={startCamera} 
                        disabled={loading}
                        className="w-full text-lg font-semibold"
                        variant="default"
                    >
                        {loading ? "Starting..." : "Enable Camera"}
                    </Button>
                 )}

                 {stream && !loading && !gender && (
                    <Button 
                        className="w-full h-12 text-lg font-semibold" 
                        onClick={handleCapture}
                    >
                        Capture & Verify
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
