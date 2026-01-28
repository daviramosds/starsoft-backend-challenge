import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale, Seat, Reservation, SeatStatus, ReservationStatus } from '@/entities';
import { RabbitMQService } from '@/shared/rabbitmq/rabbitmq.service';
import { RedisService } from '@/shared/redis/redis.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
    @InjectRepository(Reservation)
    private reservationRepository: Repository<Reservation>,
    @InjectRepository(Seat)
    private seatRepository: Repository<Seat>,
    private rabbitMQService: RabbitMQService,
    private redisService: RedisService,
    private dataSource: DataSource,
  ) {}

  async confirmPayment(confirmPaymentDto: ConfirmPaymentDto): Promise<Sale> {
    const { reservationId, paymentId } = confirmPaymentDto;

    return await this.dataSource.transaction(async (manager) => {
      const reservation = await manager.findOne(Reservation, {
        where: { id: reservationId },
        relations: ['seat', 'seat.session'],
      });

      if (!reservation) {
        throw new NotFoundException('Reserva não encontrada');
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new BadRequestException('Reserva não está pendente');
      }

      if (new Date() > reservation.expiresAt) {
        throw new BadRequestException('Reserva expirou');
      }

      reservation.status = ReservationStatus.CONFIRMED;
      await manager.save(reservation);

      const seat = reservation.seat;
      seat.status = SeatStatus.SOLD;
      await manager.save(seat);

      const sale = manager.create(Sale, {
        userId: reservation.userId,
        seatId: reservation.seatId,
        amount: seat.session.ticketPrice,
        reservationId,
        paymentId,
      });

      await manager.save(sale);

      await this.redisService.del(`reservation:${reservationId}`);

      await this.rabbitMQService.publishEvent('payment.confirmed', {
        saleId: sale.id,
        reservationId,
        seatId: seat.id,
        userId: reservation.userId,
        amount: sale.amount,
      });

      return sale;
    });
  }

  async findByUser(userId: string): Promise<Sale[]> {
    return await this.saleRepository.find({
      where: { userId },
      relations: ['seat', 'seat.session'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Sale[]> {
    return await this.saleRepository.find({
      relations: ['seat', 'seat.session'],
      order: { createdAt: 'DESC' },
    });
  }
}
