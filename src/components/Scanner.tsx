import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { isValidIsbn, normalizeIsbn } from '../lib/lookup';

interface Props {
  onDetected: (isbn: string) => void;
  onClose: () => void;
}

/** Scan EAN-13 via BarcodeDetector natif si dispo, sinon ZXing. */
export default function Scanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const cb = useRef(onDetected);
  cb.current = onDetected;

  useEffect(() => {
    let stopped = false;
    let controls: IScannerControls | undefined;
    let stream: MediaStream | undefined;
    let raf = 0;

    const done = (code: string) => {
      const isbn = normalizeIsbn(code);
      if (stopped || !isValidIsbn(isbn)) return false;
      stopped = true;
      navigator.vibrate?.(80);
      cb.current(isbn);
      return true;
    };

    (async () => {
      try {
        const Native = (window as any).BarcodeDetector;
        const formats: string[] = Native ? await Native.getSupportedFormats() : [];
        if (Native && formats.includes('ean_13')) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } },
          });
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          const detector = new Native({ formats: ['ean_13', 'ean_8', 'upc_a'] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              for (const c of codes) if (done(c.rawValue)) return;
            } catch {
              /* frame pas prête */
            }
            raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]]]);
          const reader = new BrowserMultiFormatReader(hints);
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: 'environment' } },
            videoRef.current!,
            (result) => {
              if (result && done(result.getText())) controls?.stop();
            },
          );
        }
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError' ? "Accès à la caméra refusé." : "Caméra indisponible.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted />
      <div className="scanner-frame" />
      {error && <p className="scanner-error">{error}</p>}
      <button className="btn btn-light scanner-close" onClick={onClose}>
        Fermer
      </button>
    </div>
  );
}
