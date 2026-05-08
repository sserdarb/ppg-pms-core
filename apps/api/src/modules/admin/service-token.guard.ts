import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service-to-service auth for the PPG master panel ↔ PMS control plane.
 *
 * Reads PPG_SERVICE_TOKEN from config and matches it against the
 * Authorization: Bearer <token> header on the incoming request.
 *
 * Distinct from JwtAuthGuard (which checks user JWTs from PPG SSO):
 * this is the long-lived API key the master panel itself carries.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('PPG_SERVICE_TOKEN');
    if (!expected) {
      this.logger.error('PPG_SERVICE_TOKEN is not configured — admin endpoints disabled');
      throw new UnauthorizedException('Service auth not configured');
    }

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const header = req.headers['authorization'] ?? req.headers['Authorization' as never];
    if (!header || typeof header !== 'string') {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    if (!constantTimeEqual(token, expected)) {
      throw new UnauthorizedException('Invalid service token');
    }

    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
