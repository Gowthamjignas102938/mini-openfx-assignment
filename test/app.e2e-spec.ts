import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/bootstrap.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/ (GET) — the health check stays unauthenticated, no header at all', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('rejects a /v1 request with no X-API-Key header', () => {
    return request(app.getHttpServer()).get('/v1/balances').expect(401);
  });

  it('accepts a /v1 request that carries the correct X-API-Key header', () => {
    return request(app.getHttpServer())
      .get('/v1/balances')
      .set('x-api-key', process.env.API_KEY!)
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
