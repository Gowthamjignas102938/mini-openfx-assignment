import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Single shared secret, matching the project's "single demo wallet, no
 * multi-tenancy" design — one API_KEY, not a `clients` table with one key
 * per client.
 *
 * The API_KEY presence check lives in the constructor, not canActivate(), on
 * purpose: as a global APP_GUARD provider, this constructor runs once when
 * Nest builds the DI container at startup. Checking here means a
 * misconfigured deployment (no API_KEY set) fails to boot at all, rather
 * than booting and then quietly comparing every request's header against
 * `undefined` — which a header-less request would also read as `undefined`,
 * making an unset API_KEY fail *open* (accepting every request) instead of
 * closed.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string;

  constructor(private readonly reflector: Reflector) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error(
        'API_KEY environment variable is not set — refusing to start rather than accepting every request unauthenticated.',
      );
    }
    this.apiKey = apiKey;
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (typeof providedKey !== 'string' || !this.matchesApiKey(providedKey)) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    return true;
  }

  // Plain !== short-circuits on the first differing byte, which leaks how
  // many leading characters of a guessed key are correct via response time
  // — a real concern now that this key is the only thing standing between
  // the API and being fully open. timingSafeEqual() requires equal-length
  // buffers, so the length check has to happen first (a length mismatch is
  // rejected directly rather than passed to it).
  private matchesApiKey(providedKey: string): boolean {
    const provided = Buffer.from(providedKey);
    const expected = Buffer.from(this.apiKey);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }
}
