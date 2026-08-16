/**
 * Minimal hand-rolled replacement for Manus's platform-managed `_core/index`
 * server entry point. See context.ts for why this exists.
 *
 * Everything here is same-origin: in dev, Vite runs in Express middleware
 * mode behind this same server/port, and in production this serves the built
 * client from dist/public — so the tRPC client's `credentials: "include"`
 * fetch never needs to cross an origin, and no CORS configuration is needed
 * here. (The actual AgeCare data calls go from *this* server to the backend
 * REST API in server/legacyApi.ts, which is a plain server-to-server fetch,
 * not a browser CORS concern.)
 */
import * as trpcExpress from "@trpc/server/adapters/express";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import type { TrpcContext } from "./context";
import { appRouter } from "../routers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createContext({ req, res }: trpcExpress.CreateExpressContextOptions): TrpcContext {
  return { user: null, req, res };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use(
    "/api/trpc",
    trpcExpress.createExpressMiddleware({ router: appRouter, createContext }),
  );

  if (process.env.NODE_ENV === "production") {
    // esbuild bundles this single entry file to dist/index.js (flattening the
    // server/_core/ nesting), so __dirname at runtime is dist/ itself — and
    // vite.config.ts's build.outDir is dist/public.
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    // Load the project's own vite.config.ts explicitly (it already declares
    // root/resolve.alias/plugins) rather than letting Vite search for it —
    // an inline `root` override without `configFile` failed to pick up the
    // `@`/`@shared` aliases and broke every import in dev mode.
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, "..", "..", "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
