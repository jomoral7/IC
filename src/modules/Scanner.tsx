import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

/**
 * Escaner por camara para QR y codigos de barra (EAN, Code128, etc.).
 * Un lector USB tipo "pistola" no necesita esto: escribe el codigo + Enter
 * directamente en el buscador enfocado.
 */
export function ScannerModal({
  onResult,
  onClose,
}: {
  onResult: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState("");

  // Callbacks en refs para que el efecto no se reinicie y corte la camara.
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  onResultRef.current = onResult;
  onCloseRef.current = onClose;

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          controlsRef.current = await reader.decodeFromVideoElement(video, (result, _err, controls) => {
            if (result) {
              controls.stop();
              onResultRef.current(result.getText());
              onCloseRef.current();
            }
          });
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "No se pudo abrir la camara");
      }
    }

    void start();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="qr-modal scanner-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="section-label">Escanear</p>
        <h2>Apunta al QR o codigo de barras</h2>
        {error ? (
          <div className="error-box">{error}</div>
        ) : (
          <div className="scanner-video-wrap">
            <video ref={videoRef} className="scanner-video" autoPlay muted playsInline />
            <div className="scanner-reticle" />
          </div>
        )}
        <p className="scanner-hint">
          Tambien puedes usar un lector USB: escribe directo en el buscador.
        </p>
      </div>
    </div>
  );
}
