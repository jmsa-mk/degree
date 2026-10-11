import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { analyzeFace, ForwardCalibration } from "./face-analysis.mjs";

const idle = {
  ready: false,
  loading: false,
  error: null,
  metrics: {},
  calibrating: false,
  calibrated: false,
  calibrationProgress: 0,
  calibrationMessage: "",
};
export function useCamera(enabled) {
  const videoRef = useRef(null),
    baselineRef = useRef(null),
    observationRef = useRef(null),
    calibrationRef = useRef(new ForwardCalibration());
  const [camera, setCamera] = useState(idle);
  const clearCalibratedChecks = () => window.degreebee.observation({
    facePresent: observationRef.current?.facePresent ?? null,
    eyesOpen: null,
    eyesForward: null,
    headForward: null,
  });
  const calibrate = () => {
    if (!camera.ready) return;
    calibrationRef.current.start(performance.now());
    clearCalibratedChecks();
    setCamera((prev) => ({
      ...prev,
      calibrating: true,
      calibrationProgress: 0,
      calibrationMessage:
        "Keep still and look straight ahead with both eyes open for 2 seconds. Reduce glare on glasses if needed.",
    }));
  };
  const resetCalibration = () => {
    baselineRef.current = null;
    calibrationRef.current = new ForwardCalibration();
    clearCalibratedChecks();
    setCamera((prev) => ({
      ...prev,
      calibrated: false,
      calibrating: false,
      calibrationProgress: 0,
      calibrationMessage: "Calibration reset. Calibrate again in your normal working position.",
    }));
  };
  useEffect(() => {
    let disposed = false,
      stream,
      detector,
      timer,
      lastVideoTime = -1,
      lastFrameAt = 0;
    calibrationRef.current = new ForwardCalibration();
    observationRef.current = null;
    const idleState = () => ({
      ...idle,
      calibrated: baselineRef.current != null,
      calibrationProgress: baselineRef.current ? 1 : 0,
      calibrationMessage: baselineRef.current
        ? "Using your calibration for this app session."
        : "",
    });
    const stop = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      detector?.close();
      detector = null;
      if (videoRef.current?.srcObject === stream)
        videoRef.current.srcObject = null;
    };
    if (!enabled) {
      setCamera(idleState());
      return;
    }
    setCamera({ ...idleState(), loading: true });
    const fail = (error) => {
      if (disposed) return;
      window.degreebee.observation({
        facePresent: null,
        eyesOpen: null,
        eyesForward: null,
        headForward: null,
      });
      const messages = {
        NotAllowedError:
          "Camera access was denied. Enable camera access for desktop apps in Windows Settings, then resume your session.",
        NotFoundError:
          "No camera found. Connect a webcam, then resume your session.",
        NotReadableError:
          "The camera could not be opened. Close other apps using it, then resume your session.",
      };
      setCamera({
        ...idleState(),
        error:
          messages[error.name] ||
          error.message ||
          "Camera stopped. Please resume to try again.",
      });
      stop();
    };
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          new URL("vision/", document.baseURI).href,
        );
        if (disposed) return;
        detector = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: new URL(
              "models/face_landmarker.task",
              document.baseURI,
            ).href,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        if (disposed) {
          stop();
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
        if (disposed) {
          stop();
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        if (disposed) {
          stop();
          return;
        }
        stream
          .getVideoTracks()[0]
          .addEventListener("ended", () =>
            fail(
              new Error(
                "Camera disconnected. Reconnect it, then resume your session.",
              ),
            ),
          );
        lastFrameAt = performance.now();
        const detect = () => {
          if (disposed) return;
          try {
            const now = performance.now();
            if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
              lastVideoTime = video.currentTime;
              lastFrameAt = now;
              const result = detector.detectForVideo(video, now);
              const raw = analyzeFace(
                result,
                video.videoWidth,
                video.videoHeight,
              );
              const calibration = calibrationRef.current.add(raw, now);
              if (calibration?.baseline)
                baselineRef.current = calibration.baseline;
              const observation = analyzeFace(
                result,
                video.videoWidth,
                video.videoHeight,
                baselineRef.current,
              );
              observationRef.current = observation;
              // Reference-taking is not a focus measurement. Keep actual face
              // presence live while clearing eye/pose alerts and stale states.
              if (calibrationRef.current.startedAt != null)
                clearCalibratedChecks();
              else window.degreebee.observation(observation);
              setCamera((prev) => ({
                ...prev,
                ready: true,
                loading: false,
                error: null,
                metrics: observation.metrics,
                calibrating: calibrationRef.current.startedAt != null,
                calibrated: baselineRef.current != null,
                calibrationProgress: calibrationRef.current.startedAt != null
                  ? calibrationRef.current.progress
                  : baselineRef.current ? 1 : 0,
                calibrationMessage: calibration
                  ? calibration.error ||
                    "Eye openness and forward position calibrated for this app session."
                  : prev.calibrationMessage,
              }));
            } else if (now - lastFrameAt > 2500)
              throw new Error(
                "Camera frames stopped updating. Check your camera, then resume your session.",
              );
            timer = setTimeout(detect, 100);
          } catch (error) {
            fail(error);
          }
        };
        detect();
      } catch (error) {
        fail(error);
      }
    })();
    return () => {
      disposed = true;
      stop();
    };
  }, [enabled]);
  return { videoRef, ...camera, calibrate, resetCalibration };
}
