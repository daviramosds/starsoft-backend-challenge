import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Reservation, Seat, SeatStatus, ReservationStatus } from '@/entities';
import { RedisService } from '@/shared/redis/redis.service';
import { RabbitMQService } from '@/shared/rabbitmq/rabbitmq.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private reservationRepository: Repository<Reservation>,
    @InjectRepository(Seat)
    private seatRepository: Repository<Seat>,
    private redisService: RedisService,
    private rabbitMQService: RabbitMQService,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {}

  async create(createReservationDto: CreateReservationDto): Promise<Reservation> {
    const { userId, seatId, requestId } = createReservationDto;
    const existingReservation = await this.reservationRepository.findOne({
      where: { requestId },
    });

    if (existingReservation) {
      return existingReservation;
    }

    const lockKey = `seat:lock:${seatId}`;
    const lockAcquired = await this.redisService.acquireLock(lockKey, 5);

    if (!lockAcquired) {
      throw new ConflictException('Assento está sendo processado. Tente novamente.');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const seat = await manager
          .createQueryBuilder(Seat, 'seat')
          .where('seat.id = :seatId', { seatId })
          .setLock('pessimistic_write')
          .getOne();

        if (!seat) {
          throw new NotFoundException('Assento não encontrado');
        }

        if (seat.status !== SeatStatus.AVAILABLE) {
          throw new ConflictException('Assento não está disponível');
        }

        const session = await manager
          .createQueryBuilder('Session', 'session')
          .where('session.id = :sessionId', { sessionId: seat.sessionId })
          .setLock('pessimistic_write')
          .getOne();

        const ttl = this.configService.get<number>('RESERVATION_TTL', 30);
        const expiresAt = new Date(Date.now() + ttl * 1000);

        const reservation = manager.create(Reservation, {
          userId,
          seatId,
          requestId,
          status: ReservationStatus.PENDING,
          expiresAt,
        });

        await manager.save(reservation);

        seat.status = SeatStatus.RESERVED;
        seat.version += 1;
        await manager.save(seat);

        if (session) {
          session.availableSeats = Math.max(0, session.availableSeats - 1);
          await manager.save(session);
        }

        await this.redisService.setWithTTL(
          `reservation:${reservation.id}`,
          JSON.stringify(reservation),
          ttl,
        );

        await this.rabbitMQService.publishEvent('reservation.created', {
          reservationId: reservation.id,
          seatId,
          userId,
          expiresAt,
        });

        return reservation;
      });
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  async findByUser(userId: string): Promise<Reservation[]> {
    return await this.reservationRepository.find({
      where: { userId },
      relations: ['seat'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['seat'],
    });

    if (!reservation) {
      throw new NotFoundException('Reserva não encontrada');
    }

    return reservation;
  }
}
