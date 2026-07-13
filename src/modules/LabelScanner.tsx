import { useRef, useState } from "react";
import { X } from "lucide-react";
import { CATEGORY_OPTIONS, COLOR_OPTIONS } from "../types";

export type LabelFields = {
  name?: string;
  brand?: string;
  category?: string;
  size?: string;
  color?: string;
};

// Carga Tesseract.js desde CDN una sola vez.
function loadTesseract(): Promise<any> {
  const w = window as any;
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => resolve((window as any).Tesseract);
    s.onerror = () => reject(new Error("No se pudo cargar el lector de etiquetas"));
    document.body.appendChild(s);
  });
}

function detectSize(text: string): string | undefined {
  const t = text.toUpperCase();
  // Talla explicita: "TALLA M", "SIZE 40"
  const explicit = t.match(/\b(?:TALLA|SIZE|TALLE)\s*[:.]?\s*(XS|S|M|L|XL|XXL|XXXL|\d{2})\b/);
  if (explicit) return explicit[1];
  // Letras sueltas
  const letter = t.match(/\b(XXXL|XXL|XL|XS|S|M|L)\b/);
  if (letter) return letter[1];
  // Numeros de calzado 34-46
  const num = t.match(/\b(3[4-9]|4[0-6])\b/);
  if (num) return num[1];
  return undefined;
}

function detectFromList(text: string, list: string[]): string | undefined {
  const lower = text.toLowerCase();
  // Busca la coincidencia mas larga primero (ej. "Azul marino" antes que "Azul")
  const sorted = [...list].sort((a, b) => b.length - a.length);
  return sorted.find((opt) => lower.includes(opt.toLowerCase()));
}

export function LabelScanner({ onApply, onClose }: { onApply: (fields: LabelFields) => void; onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [fields, setFields] = useState<LabelFields>({});
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setStatus("reading");
    setProgress(0);
    setErrorMsg("");
    setPreview(URL.createObjectURL(file));
    try {
      const Tesseract = await loadTesseract();
      const { data } = await Tesseract.recognize(file, "spa+eng", {
        logger: (m: any) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const text: string = data?.text ?? "";
      const rawLines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 2);
      setLines(rawLines);
      // Nombre sugerido: la linea mas larga con letras.
      const nameGuess = [...rawLines].sort((a, b) => b.length - a.length)[0] ?? "";
      setFields({
        name: nameGuess,
        brand: "",
        category: detectFromList(text, CATEGORY_OPTIONS) ?? "",
        size: detectSize(text) ?? "",
        color: detectFromList(text, COLOR_OPTIONS) ?? "",
      });
      setStatus("done");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "No se pudo leer la etiqueta");
      setStatus("error");
    }
  }

  function assign(line: string, key: "name" | "brand") {
    setFields((f) => ({ ...f, [key]: line }));
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer small-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">Etiqueta</p>
            <h2>Leer etiqueta con foto</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />

        {status === "idle" && (
          <div className="label-intro">
            <p className="mini-note">
              Toma una foto clara de la etiqueta (que se lea el texto). La app detecta talla, color y categoria, y te deja elegir
              el nombre y la marca de lo que leyo.
            </p>
            <button className="primary-button wide" onClick={() => fileRef.current?.click()}>
              Tomar / subir foto de la etiqueta
            </button>
          </div>
        )}

        {status === "reading" && (
          <div className="label-reading">
            {preview && <img src={preview} alt="etiqueta" className="label-preview" />}
            <p className="mini-note">Leyendo etiqueta... {progress}%</p>
            <div className="goal-bar">
              <div className="goal-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="label-reading">
            <p className="error-box">{errorMsg}</p>
            <button className="secondary-button wide" onClick={() => fileRef.current?.click()}>
              Intentar con otra foto
            </button>
          </div>
        )}

        {status === "done" && (
          <>
            <div className="form-grid one">
              <label>
                Nombre
                <input value={fields.name ?? ""} onChange={(e) => setFields({ ...fields, name: e.target.value })} placeholder="Nombre del producto" />
              </label>
              <label>
                Marca
                <input value={fields.brand ?? ""} onChange={(e) => setFields({ ...fields, brand: e.target.value })} placeholder="Marca" />
              </label>
              <div className="form-grid two">
                <label>
                  Categoria
                  <input value={fields.category ?? ""} onChange={(e) => setFields({ ...fields, category: e.target.value })} />
                </label>
                <label>
                  Talla
                  <input value={fields.size ?? ""} onChange={(e) => setFields({ ...fields, size: e.target.value })} />
                </label>
                <label>
                  Color
                  <input value={fields.color ?? ""} onChange={(e) => setFields({ ...fields, color: e.target.value })} />
                </label>
              </div>
            </div>

            {lines.length > 0 && (
              <div className="label-lines">
                <p className="mini-note">Texto leido — toca una linea para usarla como nombre o marca:</p>
                {lines.map((l, i) => (
                  <div className="label-line" key={i}>
                    <span>{l}</span>
                    <div className="label-line-actions">
                      <button className="chip-button" onClick={() => assign(l, "name")}>
                        Nombre
                      </button>
                      <button className="chip-button" onClick={() => assign(l, "brand")}>
                        Marca
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              className="primary-button wide"
              onClick={() => {
                onApply(fields);
                onClose();
              }}
            >
              Usar estos datos
            </button>
            <button className="secondary-button wide" onClick={() => fileRef.current?.click()}>
              Leer otra foto
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
