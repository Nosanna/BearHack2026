import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Lightweight HTTP request logger. Logs method, path, status, and duration
 * for every request. Skips static media GETs to keep the log readable.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const started = Date.now();
    const { method, originalUrl } = req;

    const isStaticMedia =
      method === 'GET' && originalUrl.startsWith('/media/local/');

    res.on('finish', () => {
      if (isStaticMedia) return;
      const ms = Date.now() - started;
      const status = res.statusCode;
      const auth = req.headers['authorization']
        ? `auth=bearer:${String(req.headers['authorization']).slice(7, 17)}…`
        : 'auth=none';
      const line = `${method} ${originalUrl} ${status} ${ms}ms ${auth}`;
      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
