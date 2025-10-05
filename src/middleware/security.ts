import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';

// Rate limiting configurations
export const generalRateLimit = process.env.NODE_ENV === 'development'
  ? (req: Request, res: Response, next: NextFunction) => next() // Skip in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 900 // 15 minutes in seconds
      },
      standardHeaders: true,
      legacyHeaders: false
    });

export const authRateLimit = process.env.NODE_ENV === 'development'
  ? (req: Request, res: Response, next: NextFunction) => next() // Skip in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // Balanced limit: enough for testing, not too permissive
      message: {
        error: 'Too many authentication attempts from this IP, please try again later.',
        retryAfter: 900
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // Don't count successful logins
      skipFailedRequests: false, // Count failed attempts to prevent brute force
      // Skip OPTIONS requests (CORS preflight)
      skip: (req: Request) => req.method === 'OPTIONS'
    });

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per hour
  message: {
    error: 'Too many upload requests from this IP, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Helmet configuration for security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
});

// Input validation schemas
export const emailSchema = z.string().email().max(255);
export const passwordSchema = z.string().min(8).max(128).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
  'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
);

export const idSchema = z.string().uuid();
export const nameSchema = z.string().min(1).max(255).trim();
export const descriptionSchema = z.string().max(1000).trim().optional();

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitize string inputs
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim().replace(/[<>]/g, ''); // Basic XSS prevention
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// File upload validation
export const validateFileUpload = (
  allowedMimeTypes: string[],
  maxSizeBytes: number
) => {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.file]) : [req.file];

    for (const file of files) {
      if (!file) continue;

      // Check file size
      if (file.size > maxSizeBytes) {
        return res.status(400).json({
          error: `File size too large. Maximum allowed size is ${maxSizeBytes} bytes.`
        });
      }

      // Check MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: `File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`
        });
      }

      // Check for potential security issues in filename
      if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
        return res.status(400).json({
          error: 'Invalid filename'
        });
      }
    }

    next();
  };
};

// Request validation middleware factory
export const validateRequest = (schema: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }

      next(error);
    }
  };
};

// CORS configuration - Updated 2025-10-05
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Production: allow private.lumiku.com and lumiku.com
    // Development: allow localhost
    const productionOrigins = ['https://private.lumiku.com', 'https://lumiku.com'];
    const developmentOrigins = ['http://localhost:3000', 'http://localhost:3001'];

    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? productionOrigins
      : developmentOrigins;

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Log rejected origin for debugging
    console.error('[CORS] Rejected origin:', origin, 'Allowed:', allowedOrigins);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    if (res.statusCode >= 400) {
      console.error('Request failed:', logData);
    } else {
      console.log('Request completed:', logData);
    }
  });

  next();
};

// Security audit middleware
export const securityAudit = (req: Request, res: Response, next: NextFunction): void => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\./,  // Path traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript protocol
    /data:.*base64/i  // Data URLs
  ];

  const checkString = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      console.warn('Suspicious request detected:', {
        ip: req.ip,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        pattern: pattern.toString()
      });
      break;
    }
  }

  next();
};