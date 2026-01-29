import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as amqp from 'amqplib';
import { AppModule } from '../src/app.module';
import { v4 as uuidv4 } from 'uuid';

describe('RabbitMQ Events E2E Tests', () => {
  let app: INestApplication;
  let connection: amqp.Connection;
  let channel: amqp.Channel;
  const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://cinema:cinema123@localhost:5672';
  const TEST_EXCHANGE = 'cinema.exchange';
  const TEST_QUEUE_PREFIX = 'test.events.';

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
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
  });

  afterAll(async () => {
    await channel.close();
    await connection.close();
    await app.close();
  });

  const consumeMessages = async (
    queueName: string,
    expectedCount: number,
    timeout = 5000,
    filterFn?: (msg: any) => boolean,
  ): Promise<any[]> => {
    const messages: any[] = [];

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (messages.length >= expectedCount) {
          resolve(messages);
        } else {
          reject(
            new Error(
              `Timeout waiting for ${expectedCount} messages. Got ${messages.length} valid messages.`,
            ),
          );
        }
      }, timeout);

      channel.consume(
        queueName,
        (msg) => {
          if (msg) {
            const content = JSON.parse(msg.content.toString());
            if (filterFn && !filterFn(content)) {
              channel.ack(msg); // Ack unwanted messages
              return;
            }

            messages.push(content);
            channel.ack(msg);

            if (messages.length >= expectedCount) {
              clearTimeout(timer);
              resolve(messages);
            }
          }
        },
        { noAck: false },
      );
    });
  };

  describe('Reservation Events', () => {
    let seatId: string;

    beforeAll(async () => {
      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: `RabbitMQ Test ${Date.now()}`,
          room: 'Test Room',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          ticketPrice: 25.0,
          totalSeats: 16,
        });

      seatId = sessionResponse.body.seats[0].id;
    });

    it('should publish "reservation.created" event when reservation is created', async () => {
      const testQueue = `${TEST_QUEUE_PREFIX}reservation.created`;
      await channel.assertQueue(testQueue, { durable: false, exclusive: true, autoDelete: true });
      await channel.bindQueue(testQueue, TEST_EXCHANGE, 'reservation.created');
      await channel.purgeQueue(testQueue);

      const userId = `test-user-${Date.now()}`;
      const requestId = uuidv4();

      const reservationPromise = request(app.getHttpServer())
        .post('/reservations')
        .send({
          userId,
          seatId,
          requestId,
        })
        .expect(201);
      const [reservationResponse, messages] = await Promise.all([
        reservationPromise,
        consumeMessages(testQueue, 1),
      ]);
      expect(messages).toHaveLength(1);
      const event = messages[0];

      expect(event).toMatchObject({
        reservationId: reservationResponse.body.id,
        seatId,
        userId,
      });
      expect(event).toHaveProperty('expiresAt');

      console.log('✅ Event "reservation.created" published successfully:', event);
      await channel.unbindQueue(testQueue, TEST_EXCHANGE, 'reservation.created');
      await channel.deleteQueue(testQueue);
    });
  });

  describe('Payment Events', () => {
    let reservationId: string;
    let seatId: string;

    beforeAll(async () => {
      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: `Payment Test ${Date.now()}`,
          room: 'Payment Room',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          ticketPrice: 30.0,
          totalSeats: 16,
        });

      seatId = sessionResponse.body.seats[0].id;
      const reservationResponse = await request(app.getHttpServer()).post('/reservations').send({
        userId: 'payment-event-user',
        seatId,
        requestId: uuidv4(),
      });

      reservationId = reservationResponse.body.id;
    });

    it('should publish "payment.confirmed" event when payment is confirmed', async () => {
      const testQueue = `${TEST_QUEUE_PREFIX}payment.confirmed`;
      await channel.assertQueue(testQueue, { durable: false, exclusive: true, autoDelete: true });
      await channel.bindQueue(testQueue, TEST_EXCHANGE, 'payment.confirmed');
      await channel.purgeQueue(testQueue);
      const paymentId = `payment-${Date.now()}`;

      const paymentPromise = request(app.getHttpServer())
        .post('/sales/confirm-payment')
        .send({
          reservationId,
          paymentId,
        })
        .expect(201);
      const [paymentResponse, messages] = await Promise.all([
        paymentPromise,
        consumeMessages(testQueue, 1),
      ]);
      expect(messages).toHaveLength(1);
      const event = messages[0];

      expect(event).toMatchObject({
        saleId: paymentResponse.body.id,
        reservationId,
        seatId,
        userId: 'payment-event-user',
        amount: '30.00',
      });

      console.log('✅ Event "payment.confirmed" published successfully:', event);
      await channel.unbindQueue(testQueue, TEST_EXCHANGE, 'payment.confirmed');
      await channel.deleteQueue(testQueue);
    });
  });

  describe('Event Reliability', () => {
    it('should handle multiple concurrent events without loss', async () => {
      const testQueue = `${TEST_QUEUE_PREFIX}concurrent`;
      await channel.assertQueue(testQueue, { durable: false, exclusive: true, autoDelete: true });
      await channel.bindQueue(testQueue, TEST_EXCHANGE, 'reservation.created');
      await channel.purgeQueue(testQueue);

      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: `Concurrent Test ${Date.now()}`,
          room: 'Concurrent Room',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          ticketPrice: 20.0,
          totalSeats: 16,
        });

      const seats = sessionResponse.body.seats;
      const numReservations = 5;
      const reservationPromises = seats.slice(0, numReservations).map((seat, i) =>
        request(app.getHttpServer())
          .post('/reservations')
          .send({
            userId: `concurrent-user-${i}`,
            seatId: seat.id,
            requestId: uuidv4(),
          })
          .expect(201),
      );
      const [reservations, messages] = await Promise.all([
        Promise.all(reservationPromises),
        consumeMessages(
          testQueue,
          numReservations,
          10000,
          (msg) => msg.userId && msg.userId.startsWith('concurrent-user-'),
        ),
      ]);
      expect(messages).toHaveLength(numReservations);
      expect(reservations).toHaveLength(numReservations);
      const reservationIds = reservations.map((r) => r.body.id);
      const eventReservationIds = messages.map((m) => m.reservationId);
      expect(eventReservationIds.sort()).toEqual(reservationIds.sort());

      console.log(`✅ ${numReservations} concurrent events published and consumed successfully`);
      await channel.unbindQueue(testQueue, TEST_EXCHANGE, 'reservation.created');
      await channel.deleteQueue(testQueue);
    });
  });
});
