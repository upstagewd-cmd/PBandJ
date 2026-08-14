import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function isAdminRequest(req: Request): boolean {
  const code = req.headers["x-admin-code"] as string | undefined;
  const passcode = process.env.ADMIN_PASSCODE ?? "pbj2024";
  return !!code && code === passcode;
}

function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

router.post("/storage/championships", async (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: "Invalid admin passcode" });
    return;
  }
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "image/png") {
    res.status(400).json({ error: "Championship artwork must be a PNG" });
    return;
  }

  const maxBytes = 6 * 1024 * 1024;
  let size = 0;
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= maxBytes) chunks.push(chunk);
  });
  req.on("error", () => {
    if (!res.headersSent) res.status(400).json({ error: "Failed to read artwork" });
  });
  req.on("end", async () => {
    if (size === 0) { res.status(400).json({ error: "Missing artwork" }); return; }
    if (size > maxBytes) { res.status(413).json({ error: "Artwork must be 6 MB or smaller" }); return; }
    const dimensions = getPngDimensions(Buffer.concat(chunks));
    if (!dimensions) { res.status(400).json({ error: "Artwork is not a valid PNG" }); return; }
    if (dimensions.width > 1600 || dimensions.height > 1200) {
      res.status(400).json({ error: "Artwork dimensions must be 1600x1200 or smaller" });
      return;
    }
    try {
      const objectPath = await objectStorageService.uploadObjectEntity(Buffer.concat(chunks), "image/png");
      res.json({ objectPath, width: dimensions.width, height: dimensions.height });
    } catch (error) {
      req.log.error({ err: error }, "Championship artwork upload failed");
      res.status(500).json({ error: "Failed to store championship artwork" });
    }
  });
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Fallback binary upload path for clients that cannot PUT directly to object storage.
router.post("/storage/uploads/direct", async (req: Request, res: Response) => {
  const rawName = req.query.name;
  const rawContentType = req.query.contentType;
  const name = typeof rawName === "string" ? rawName : "upload";
  const contentType = typeof rawContentType === "string" ? rawContentType : undefined;

  const MAX_BYTES = 6 * 1024 * 1024;
  let size = 0;
  const chunks: Buffer[] = [];

  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      req.destroy(new Error("Payload too large"));
      return;
    }
    chunks.push(chunk);
  });

  req.on("error", (err) => {
    req.log.error({ err }, "Direct upload stream failed");
    if (!res.headersSent) {
      res.status(400).json({ error: "Failed to read upload stream" });
    }
  });

  req.on("end", async () => {
    try {
      if (chunks.length === 0) {
        res.status(400).json({ error: "Missing upload body" });
        return;
      }

      const objectPath = await objectStorageService.uploadObjectEntity(
        Buffer.concat(chunks),
        contentType
      );

      req.log.info({ name, size }, "Direct upload stored");
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Direct upload failed");
      res.status(500).json({ error: "Failed to store upload" });
    }
  });
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
