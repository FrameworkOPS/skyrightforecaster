import { Request, Response, NextFunction } from 'express';
import { extractToken, verifyToken, JWTPayload } from '../utils/auth';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export const roleHierarchy = {
  admin: ['admin', 'manager', 'scheduler', 'viewer'],
  manager: ['manager', 'scheduler', 'viewer'],
  scheduler: ['scheduler', 'viewer'],
  viewer: ['viewer'],
};

export function hasPermission(userRole: string, requiredRole: string): boolean {
  const allowedRoles = roleHierarchy[userRole as keyof typeof roleHierarchy] || [];
  return allowedRoles.includes(requiredRole);
}
