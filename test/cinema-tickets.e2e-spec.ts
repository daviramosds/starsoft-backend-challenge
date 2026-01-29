import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { v4 as uuidv4 } from 'uuid';

describe('Cinema Tickets E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const createTestSession = async () => {
    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send({
        movieTitle: `Test Movie ${Date.now()}`,
        room: `Room ${Date.now()}`,
        startTime: new Date(Date.now() + 86400000).toISOString(),
        ticketPrice: 25.0,
        totalSeats: 16,
      });

    return {
      sessionId: response.body.id,
      seatIds: response.body.seats.map((seat) => seat.id),
      seats: response.body.seats,
    };
  };

  describe('Sessions Management', () => {
    it('should create a new session with 16 seats', async () => {
      const response = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Test Movie',
          room: 'Test Room',
          startTime: '2024-12-31T20:00:00Z',
          ticketPrice: 25.0,
          totalSeats: 16,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.movieTitle).toBe('Test Movie');
      expect(response.body.totalSeats).toBe(16);
      expect(response.body.availableSeats).toBe(16);
      expect(response.body.seats).toHaveLength(16);
    });

    it('should list all sessions', async () => {
      await createTestSession(); // Ensure at least one session exists
      const response = await request(app.getHttpServer()).get('/sessions').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should get session by ID', async () => {
      const { sessionId } = await createTestSession();
      const response = await request(app.getHttpServer()).get(`/sessions/${sessionId}`).expect(200);

      expect(response.body.id).toBe(sessionId);
    });

    it('should list available seats for a session', async () => {
      const { sessionId } = await createTestSession();
      const response = await request(app.getHttpServer())
        .get(`/sessions/${sessionId}/available-seats`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(16);
    });

    it('should not allow creating a session for the same room at the same time', async () => {
      const movieTitle = `Duplicate Test ${Date.now()}`;
      const room = `Room ${Date.now()}`;
      const startTime = '2025-02-15T19:00:00Z';
      const response1 = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle,
          room,
          startTime,
          ticketPrice: 25.0,
          totalSeats: 16,
        })
        .expect(201);

      expect(response1.body).toHaveProperty('id');
      await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Different Movie',
          room, // Same room
          startTime, // Same time
          ticketPrice: 25.0,
          totalSeats: 16,
        })
        .expect(409); // Conflict

      console.log('✅ Duplicate session validation: correctly rejected conflicting session');
    });
  });

  describe('Reservations', () => {
    let localSeatIds: string[] = [];

    beforeAll(async () => {
      const { seatIds } = await createTestSession();
      localSeatIds = seatIds;
    });

    it('should create a reservation successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'user-test-1',
          seatId: localSeatIds[0],
          requestId: uuidv4(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe('user-test-1');
      expect(response.body.seatId).toBe(localSeatIds[0]);
      expect(response.body.status).toBe('pending');
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('should be idempotent - same requestId returns same reservation', async () => {
      const requestId = uuidv4();

      const response1 = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'user-test-2',
          seatId: localSeatIds[1],
          requestId,
        })
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'user-test-2',
          seatId: localSeatIds[1],
          requestId,
        })
        .expect(201);

      expect(response1.body.id).toBe(response2.body.id);
    });

    it('should fail to reserve an already reserved seat', async () => {
      const seatId = localSeatIds[2];
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'user-test-3',
          seatId,
          requestId: uuidv4(),
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'user-test-4',
          seatId,
          requestId: uuidv4(),
        })
        .expect(409);
    });

    it('should list reservations by user', async () => {
      const response = await request(app.getHttpServer())
        .get('/reservations?userId=user-test-1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].userId).toBe('user-test-1');
    });
  });

  describe('Sales / Payment Confirmation', () => {
    let reservationId: string;
    let localSeatIds: string[] = [];

    beforeAll(async () => {
      const { seatIds } = await createTestSession();
      localSeatIds = seatIds;

      const reservation = await request(app.getHttpServer()).post('/reservations').send({
        userId: 'user-payment-test',
        seatId: localSeatIds[0],
        requestId: uuidv4(),
      });

      reservationId = reservation.body.id;
    });

    it('should confirm payment and create sale', async () => {
      const response = await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId,
          paymentId: 'payment-test-123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe('user-payment-test');
      expect(parseFloat(response.body.amount)).toBe(25.0);
      expect(response.body.paymentId).toBe('payment-test-123');
    });

    it('should fail to confirm payment for expired reservation', async () => {
      const expiredReservation = await request(app.getHttpServer()).post('/reservations').send({
        userId: 'user-expired-test',
        seatId: localSeatIds[1],
        requestId: uuidv4(),
      });
      await new Promise((resolve) => setTimeout(resolve, 31000));

      await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId: expiredReservation.body.id,
          paymentId: 'payment-expired-test',
        })
        .expect(400);
    }, 35000); // Increase timeout for this test

    it('should list sales by user', async () => {
      const response = await request(app.getHttpServer())
        .get('/sales?userId=user-payment-test')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].userId).toBe('user-payment-test');
    });

    it('should fail to reserve a sold seat', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'user-test-sold',
          seatId: localSeatIds[0], // This seat was sold in previous test
          requestId: uuidv4(),
        })
        .expect(409);
    });
  });

  describe('Concurrency Tests - Race Conditions', () => {
    let localSeatIds: string[] = [];

    beforeAll(async () => {
      const { seatIds } = await createTestSession();
      localSeatIds = seatIds;
    });

    it('should handle concurrent requests for the same seat - only one succeeds', async () => {
      const seatId = localSeatIds[0];
      const numUsers = 10;
      const promises = Array.from({ length: numUsers }, (_, i) =>
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: `concurrent-user-${i}`,
            seatId,
            requestId: uuidv4(),
          })
          .then((res) => ({ status: res.status, body: res.body }))
          .catch((err) => ({ status: err.status, body: err.response?.body })),
      );

      const results = await Promise.all(promises);
      const successful = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(successful.length).toBe(1);
      expect(conflicts.length).toBe(numUsers - 1);

      console.log(
        `✅ Concurrency test: ${successful.length} success, ${conflicts.length} conflicts`,
      );
    });

    it('should handle concurrent requests for different seats - all succeed', async () => {
      const numUsers = 5;
      const startSeatIndex = 1;
      const promises = Array.from({ length: numUsers }, (_, i) =>
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: `concurrent-user-diff-${i}`,
            seatId: localSeatIds[startSeatIndex + i],
            requestId: uuidv4(),
          }),
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBe(numUsers);

      console.log(`✅ Different seats concurrency: ${successful.length} reservations created`);
    });
  });

  describe('Deadlock Prevention', () => {
    it('should prevent deadlock when multiple users try to reserve multiple seats simultaneously', async () => {
      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: `Deadlock Test ${Date.now()}`,
          room: 'Deadlock Room',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          ticketPrice: 20.0,
          totalSeats: 16,
        })
        .expect(201);

      const seats = sessionResponse.body.seats;
      const userAPromise = Promise.all([
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: 'user-A',
            seatId: seats[0].id,
            requestId: uuidv4(),
          })
          .then((res) => ({ user: 'A', seat: 0, status: res.status }))
          .catch((err) => ({ user: 'A', seat: 0, status: err.status })),
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: 'user-A',
            seatId: seats[1].id,
            requestId: uuidv4(),
          })
          .then((res) => ({ user: 'A', seat: 1, status: res.status }))
          .catch((err) => ({ user: 'A', seat: 1, status: err.status })),
      ]);
      const userBPromise = Promise.all([
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: 'user-B',
            seatId: seats[1].id,
            requestId: uuidv4(),
          })
          .then((res) => ({ user: 'B', seat: 1, status: res.status }))
          .catch((err) => ({ user: 'B', seat: 1, status: err.status })),
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: 'user-B',
            seatId: seats[0].id,
            requestId: uuidv4(),
          })
          .then((res) => ({ user: 'B', seat: 0, status: res.status }))
          .catch((err) => ({ user: 'B', seat: 0, status: err.status })),
      ]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Deadlock detected: system hung for >10s')), 10000),
      );
      const results = await Promise.race([
        Promise.all([userAPromise, userBPromise]),
        timeoutPromise,
      ]);
      const allResults = results.flat();
      expect(allResults).toBeDefined();
      expect(allResults.length).toBe(4);
      const successes = allResults.filter((r) => r.status === 201);
      const conflicts = allResults.filter((r) => r.status === 409);
      expect(successes.length).toBeGreaterThan(0);
      expect(conflicts.length).toBeGreaterThan(0);

      console.log(
        `✅ Deadlock prevention: ${successes.length} successes, ${conflicts.length} conflicts (no hang)`,
      );
    }, 15000); // Increase timeout for this test
  });

  describe('Full Workflow', () => {
    it('should complete a full booking workflow: create session → reserve → pay', async () => {
      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Workflow Test Movie',
          room: 'Sala Workflow',
          startTime: '2024-12-31T22:00:00Z',
          ticketPrice: 30.0,
          totalSeats: 16,
        })
        .expect(201);

      const workflowSessionId = sessionResponse.body.id;
      const workflowSeatId = sessionResponse.body.seats[0].id;
      const reservationResponse = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'workflow-user',
          seatId: workflowSeatId,
          requestId: uuidv4(),
        })
        .expect(201);

      const workflowReservationId = reservationResponse.body.id;
      const saleResponse = await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId: workflowReservationId,
          paymentId: 'workflow-payment-123',
        })
        .expect(201);

      expect(parseFloat(saleResponse.body.amount)).toBe(30.0);
      const sessionCheck = await request(app.getHttpServer())
        .get(`/sessions/${workflowSessionId}`)
        .expect(200);

      const soldSeat = sessionCheck.body.seats.find((s) => s.id === workflowSeatId);
      expect(soldSeat.status).toBe('sold');

      console.log('✅ Full workflow completed successfully');
    });
  });

  describe('Input Validation', () => {
    it('should reject session creation with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: '', // Empty title
          room: 'Test Room',
          startTime: '2024-12-31T20:00:00Z',
          ticketPrice: 25.0,
          totalSeats: 16,
        })
        .expect(400);
    });

    it('should reject session with less than 16 seats', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Test Movie',
          room: 'Test Room',
          startTime: '2024-12-31T20:00:00Z',
          ticketPrice: 25.0,
          totalSeats: 10, // Less than minimum
        })
        .expect(400);
    });

    it('should reject reservation without requestId', async () => {
      const { seatIds } = await createTestSession();
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'test-user',
          seatId: seatIds[0],
        })
        .expect(400);
    });

    it('should reject reservation with invalid seatId format', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'test-user',
          seatId: 'invalid-uuid',
          requestId: uuidv4(),
        })
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent session', async () => {
      const fakeId = uuidv4();
      await request(app.getHttpServer()).get(`/sessions/${fakeId}`).expect(404);
    });

    it('should return 404 when confirming payment for non-existent reservation', async () => {
      const fakeReservationId = uuidv4();
      await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId: fakeReservationId,
          paymentId: 'fake-payment',
        })
        .expect(404);
    });

    it('should fail to reserve non-existent seat', async () => {
      const fakeSeatId = uuidv4();
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'test-user',
          seatId: fakeSeatId,
          requestId: uuidv4(),
        })
        .expect(404);
    });
  });

  describe('Business Logic Validation', () => {
    let localSeatIds: string[] = [];

    beforeAll(async () => {
      const { seatIds } = await createTestSession();
      localSeatIds = seatIds;
    });

    it('should not allow negative ticket price', async () => {
      await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Test Movie',
          room: 'Test Room',
          startTime: '2024-12-31T20:00:00Z',
          ticketPrice: -10.0,
          totalSeats: 16,
        })
        .expect(400);
    });

    it('should verify reservation expiration timestamp is ~30 seconds in future', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'expiration-test-user',
          seatId: localSeatIds[0],
          requestId: uuidv4(),
        })
        .expect(201);

      const expiresAt = new Date(response.body.expiresAt);
      const now = new Date();
      const diffSeconds = (expiresAt.getTime() - now.getTime()) / 1000;

      expect(diffSeconds).toBeGreaterThan(28);
      expect(diffSeconds).toBeLessThan(32);
    });

    it('should not allow duplicate payment confirmation', async () => {
      const reservation = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'double-payment-user',
          seatId: localSeatIds[1],
          requestId: uuidv4(),
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId: reservation.body.id,
          paymentId: 'first-payment',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId: reservation.body.id,
          paymentId: 'second-payment',
        })
        .expect(400);
    });
  });

  describe('Data Integrity', () => {
    let localSeatIds: string[] = [];
    let localSessionId: string;

    beforeAll(async () => {
      const { seatIds, sessionId } = await createTestSession();
      localSeatIds = seatIds;
      localSessionId = sessionId;
    });

    it('should decrement availableSeats when seat is reserved', async () => {
      const session = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Integrity Test',
          room: 'Integrity Room',
          startTime: '2024-12-31T23:00:00Z',
          ticketPrice: 20.0,
          totalSeats: 16,
        })
        .expect(201);

      const initialAvailable = session.body.availableSeats;
      await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'integrity-user',
          seatId: session.body.seats[0].id,
          requestId: uuidv4(),
        })
        .expect(201);
      const updated = await request(app.getHttpServer())
        .get(`/sessions/${session.body.id}`)
        .expect(200);

      expect(updated.body.availableSeats).toBe(initialAvailable - 1);
    });

    it('should maintain seat status consistency', async () => {
      const seat = localSeatIds[0];
      const reservation = await request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId: 'status-test-user',
          seatId: seat,
          requestId: uuidv4(),
        })
        .expect(201);
      expect(reservation.body.status).toBe('pending');
      await request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId: reservation.body.id,
          paymentId: 'status-payment',
        })
        .expect(201);
      const session = await request(app.getHttpServer())
        .get(`/sessions/${localSessionId}`)
        .expect(200);

      const updatedSeat = session.body.seats.find((s) => s.id === seat);
      expect(updatedSeat.status).toBe('sold');
    });
  });

  describe.skip('Rate Limiting', () => {
    it('should enforce rate limits on rapid requests', async () => {
      const promises = Array.from({ length: 15 }, () =>
        request(app.getHttpServer())
          .get('/sessions')
          .then((res) => res.status)
          .catch((err: any) => err.status || 500),
      );

      const statuses = await Promise.all(promises);
      const tooManyRequests = statuses.filter((status) => status === 429);
      expect(tooManyRequests.length).toBeGreaterThan(0);

      console.log(`✅ Rate limiting: ${tooManyRequests.length} requests blocked with 429`);
    });

    it('should include rate limit headers in response', async () => {
      const response = await request(app.getHttpServer()).get('/sessions').expect(200);
      expect(response.headers).toHaveProperty('x-ratelimit-limit-short');
      expect(response.headers).toHaveProperty('x-ratelimit-limit-medium');
      expect(response.headers).toHaveProperty('x-ratelimit-limit-long');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining-short');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining-medium');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining-long');
      expect(response.headers).toHaveProperty('x-ratelimit-reset-short');
      expect(response.headers).toHaveProperty('x-ratelimit-reset-medium');
      expect(response.headers).toHaveProperty('x-ratelimit-reset-long');
    });
  });
});
