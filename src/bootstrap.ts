import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';

/**
 * Applies the app's real production configuration (CORS, /v1 versioning,
 * validation) to a given Nest application instance. Split out from main.ts
 * so e2e tests can configure a TestingModule-created app identically to the
 * real one — a test app built via Test.createTestingModule(...) does NOT
 * automatically pick up anything main.ts's bootstrap() does, so without
 * this, an e2e test would silently run against an unversioned,
 * unvalidated app and miss real bugs in either.
 */
export function configureApp(app: INestApplication): void {
  app.enableCors();

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
