import { type Request, type Response, type NextFunction } from "express";

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const code =
    (req.headers["x-admin-code"] as string) ?? (req.query["code"] as string);
  const passcode = process.env.ADMIN_PASSCODE ?? "pbj2024";
  if (!code || code !== passcode) {
    res.status(401).json({ error: "Invalid admin passcode" });
    return;
  }
  next();
}
