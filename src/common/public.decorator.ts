import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a single route as exempt from ApiKeyGuard — e.g. a health check,
 * which uptime monitors can't be expected to send a secret header to.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
