import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

// Singleton model loading
let _modelsLoaded = false;
let _modelsPromise = null;

async function loadModels() {
  if (_modelsLoaded) return;
  if (_modelsPromise) return _modelsPromise;
  _modelsPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models")
  ]).then(() => {
    _modelsLoaded = true;
    _modelsPromise = null;
  }).catch((e) => {
    _modelsPromise = null;
    throw e;
  });
  return _modelsPromise;
}

export default function FaceCapture({ isOpen, onClose, onCapture, title = "Face Capture" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // status: "idle" | "loading" | "camera-ready" | "detecting" | "error"
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function start() {
      setStatus("loading");
      setMessage("");
      try {
        await loadModels();
      } catch {
        if (!cancelled) { setStatus("error"); setMessage("Failed to load face detection models."); }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (cancelled) { for (const t of stream.getTracks()) t.stop(); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (!cancelled) setStatus("camera-ready");
      } catch {
        if (!cancelled) { setStatus("error"); setMessage("Camera access denied or unavailable."); }
      }
    }
    void start();

    return () => {
      cancelled = true;
      stopCamera();
      setStatus("idle");
      setMessage("");
    };
  }, [isOpen, stopCamera]);

  const handleCapture = useCallback(async () => {
    if (status !== "camera-ready" || !videoRef.current) return;
    setStatus("detecting");
    setMessage("");
    try {
      const det = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!det) {
        setStatus("camera-ready");
        setMessage("No face detected. Face the camera directly and try again.");
        return;
      }
      stopCamera();
      onCapture(Array.from(det.descriptor));
    } catch {
      setStatus("camera-ready");
      setMessage("Detection failed. Please try again.");
    }
  }, [status, stopCamera, onCapture]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  if (!isOpen) return null;

  const isLoading = status === "loading" || status === "detecting";
  const isCameraReady = status === "camera-ready";

  return (
    <div className="face-capture-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="face-capture-modal">
        <div className="all-users-head">
          <h3>{title}</h3>
          <button type="button" className="header-btn panel-close-btn" aria-label="Close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="face-capture-video-wrap">
          {status === "loading" && <p className="att-msg">Loading models...</p>}
          {status === "error" && <p className="att-msg att-msg-error">{message}</p>}
          <video
            ref={videoRef}
            className="face-capture-video"
            autoPlay
            muted
            playsInline
            hidden={!isCameraReady && status !== "detecting"}
          />
        </div>

        {message && status === "camera-ready" && (
          <p className="att-msg att-msg-error">{message}</p>
        )}

        <div className="att-btn-row face-capture-actions">
          {isCameraReady && (
            <button type="button" className="btn att-checkin-btn" onClick={handleCapture}>
              Capture Face
            </button>
          )}
          {isLoading && (
            <button type="button" className="btn" disabled>Processing...</button>
          )}
        </div>
      </div>
    </div>
  );
}
