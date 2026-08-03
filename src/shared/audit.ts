
import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  role?: string;
}

export function auditLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.userId || 'anonymous';
  const ip = req.ip || 'unknown';
  console.log('[Audit] ' + req.method + ' ' + req.path + ' - User: ' + user + ' - IP: ' + ip);
  next();
}