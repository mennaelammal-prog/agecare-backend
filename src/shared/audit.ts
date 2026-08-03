import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  role?: string;
}

export function auditLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.userId || 'anonymous';
  const ip = req.ip || 'unknown';
  const method = req.method;
  const path = req.path;
  console.log('[Audit] ' + method + ' ' + path + ' - User: ' + user + ' - IP: ' + ip);
  next();
}