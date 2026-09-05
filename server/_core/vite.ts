import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    // The managed preview proxy can intermittently close Vite's upgrade
    // request. A normal reload is more reliable than surfacing a false HMR
    // socket failure to marketplace users during development.
    hmr: false,
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  // The marketplace preview needs Vite's client-module exports for transformed
  // modules, but the proxy cannot maintain its WebSocket. Serve compatible
  // no-op exports so the app renders without starting an HMR reconnect loop.
  app.get("/@vite/client", (_req, res) => {
    res.type("application/javascript").send(`
      export class ErrorOverlay extends HTMLElement {}
      export const createHotContext = () => ({ accept() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, send() {} });
      export const injectQuery = (url) => url;
      const styles = new Map();
      export const updateStyle = (id, content) => {
        let style = styles.get(id);
        if (!style) {
          style = document.createElement("style");
          style.setAttribute("type", "text/css");
          style.setAttribute("data-vite-dev-id", id);
          document.head.appendChild(style);
          styles.set(id, style);
        }
        style.textContent = content;
      };
      export const removeStyle = (id) => {
        const style = styles.get(id);
        if (style) style.remove();
        styles.delete(id);
      };
    `);
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
