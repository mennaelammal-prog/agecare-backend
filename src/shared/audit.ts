import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  role?: string;
}

export function auditLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  console.log([Audit]   - User:  - IP: );
  next();
}
