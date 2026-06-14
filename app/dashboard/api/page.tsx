"use client";

import { useEffect, useRef, useState } from "react";

// API explorer: loads Swagger UI from CDN and points it at the live v7
// OpenAPI spec served by /api/v7/openapi. Rendered client-side to avoid
// bundling swagger-ui into the Next build.
const SWAGGER_CSS = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
const SWAGGER_JS = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";

export default function ApiExplorerPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function loadScript(src: string): Promise<void> {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`failed to load ${src}`));
        document.body.appendChild(s);
      });
    }

    if (!document.querySelector(`link[href="${SWAGGER_CSS}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = SWAGGER_CSS;
      document.head.appendChild(l);
    }

    loadScript(SWAGGER_JS)
      .then(() => {
        if (cancelled) return;
        const SwaggerUIBundle = (window as any).SwaggerUIBundle;
        if (!SwaggerUIBundle || !ref.current) {
          setErr("Swagger UI failed to initialize.");
          return;
        }
        SwaggerUIBundle({
          url: "/api/v7/openapi",
          domNode: ref.current,
          deepLinking: true,
          docExpansion: "list",
        });
      })
      .catch((e) => setErr(e.message));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">API Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Live OpenAPI spec from <code className="bg-muted px-1 rounded">/api/v7/openapi</code>.
          Note: org endpoints require M-7 HMAC auth — use the dashboard pages (or your own signer)
          to call them; the explorer is for reference.
        </p>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      <div className="bg-white rounded-lg border border-border">
        <div ref={ref} />
      </div>
    </div>
  );
}
