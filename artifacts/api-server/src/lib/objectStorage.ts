import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

interface R2ObjectFile {
  bucket: string;
  key: string;
}
const bucketName = process.env.R2_BUCKET_NAME;

if (!bucketName) {
  throw new Error("R2_BUCKET_NAME is not configured");
}

export const objectStorageClient = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}


export class ObjectStorageService {
  async searchPublicObject(filePath: string): Promise<R2ObjectFile | null> {
    const key = `${this.getPrivateObjectDir()}/${filePath}`;

    try {
      await objectStorageClient.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

      return {
        bucket: bucketName!,
        key,
      };
    } catch {
      return null;
    }
  }
  getPublicObjectSearchPaths(): Array<string> {
    return [
      process.env.PUBLIC_OBJECT_SEARCH_PATHS || "",
    ].filter(Boolean);
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR;

    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not configured");
    }

    return dir.replace(/^\/|\/$/g, "");
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const key = `${this.getPrivateObjectDir()}/uploads/${objectId}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    return getSignedUrl(objectStorageClient, command, {
      expiresIn: 900,
    });
  }

  async uploadObjectEntity(buffer: Buffer, contentType?: string): Promise<string> {
    const objectId = randomUUID();
    const key = `${this.getPrivateObjectDir()}/uploads/${objectId}`;

    await objectStorageClient.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ...(contentType ? { ContentType: contentType } : {}),
      })
    );

    return `/objects/uploads/${objectId}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }

    try {
      const url = new URL(rawPath);
      const key = url.pathname.replace(/^\//, "");
      const prefix = `${this.getPrivateObjectDir()}/`;

      if (key.startsWith(prefix)) {
        return `/objects/${key.slice(prefix.length)}`;
      }

      return `/objects/${key}`;
    } catch {
      return rawPath;
    }
  }

async getObjectEntityFile(objectPath: string): Promise<R2ObjectFile>
 {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const key = `${this.getPrivateObjectDir()}/${objectPath.replace("/objects/", "")}`;

    try {
      await objectStorageClient.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );
    } catch {
      throw new ObjectNotFoundError();
    }

    return {
      bucket: bucketName!,
      key,
    };
  }

  async downloadObject(file: {
    bucket: string;
    key: string;
  }): Promise<Response> {
    const response = await objectStorageClient.send(
      new GetObjectCommand({
        Bucket: file.bucket,
        Key: file.key,
      })
    );

    if (!response.Body) {
      throw new ObjectNotFoundError();
    }

    const stream = response.Body as Readable;

    return new Response(stream as any, {
      headers: {
        "Content-Type":
          response.ContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

async canAccessObjectEntity({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: R2ObjectFile;
  requestedPermission?: ObjectPermission;
}): Promise<boolean> {
  return true;
}
}
