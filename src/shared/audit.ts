import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  role?: string;
}

export function auditLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  console.log(`[Audit] ${req.method} ${req.path} - User: ${req.userId || 'anonymous'} - IP: ${req.ip}`);
  next();
}