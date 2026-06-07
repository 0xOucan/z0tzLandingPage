import "swagger-ui-dist/swagger-ui.css";

export const metadata = {
  title: "Z0tz V7 API — Reference",
  description: "OpenAPI 3.1 reference for the Z0tz V7 relayer + B2B SaaS API.",
};

/**
 * Swagger UI page served at /docs.
 *
 * We mount the bundled Swagger UI from swagger-ui-dist via a tiny
 * inline script — avoids the React peer-dep tangle from
 * swagger-ui-react (it pins React 18; landing runs React 19).
 *
 * Spec source: /api/openapi (regenerated on every request from the
 * v7Registry, so docs and behavior can't drift).
 */
export default function DocsPage() {
  return (
    <>
      <div id="swagger-ui" />
      <script
        type="module"
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        dangerouslySetInnerHTML={{
          __html: `
            import SwaggerUIBundle from "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.6/swagger-ui-bundle.js";
            window.ui = SwaggerUIBundle({
              url: "/api/openapi",
              dom_id: "#swagger-ui",
              deepLinking: true,
              presets: [SwaggerUIBundle.presets.apis],
              layout: "BaseLayout",
            });
          `,
        }}
      />
    </>
  );
}
