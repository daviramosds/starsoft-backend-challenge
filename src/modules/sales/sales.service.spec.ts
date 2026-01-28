import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sale, Reservation, Seat, SeatStatus, ReservationStatus } from '@/entities';
import { RabbitMQService } from '@/shared/rabbitmq/rabbitmq.service';
import { RedisService } from '@/shared/redis/redis.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesService', () => {
  let service: SalesService;
  let saleRepository: jest.Mocked<Repository<Sale>>;

  let rabbitMQService: jest.Mocked<RabbitMQService>;
  let redisService: jest.Mocked<RedisService>;
  let dataSource: jest.Mocked<DataSource>;
  let entityManager: jest.Mocked<EntityManager>;

  const mockSale: Partial<Sale> = {
    id: 'sale-123',
    userId: 'user-123',
    seatId: 'seat-123',
    amount: 25.0,
    reservationId: 'reservation-123',
    paymentId: 'payment-123',
  };

  const mockReservation: Partial<Reservation> = {
    id: 'reservation-123',
    userId: 'user-123',
    seatId: 'seat-123',
    status: ReservationStatus.PENDING,
    expiresAt: new Date(Date.now() + 30000),
    seat: {
      id: 'seat-123',
      seatNumber: 'A1',
      status: SeatStatus.RESERVED,
      session: {
        ticketPrice: 25.0,
      },
    } as any,
  };

  beforeEach(async () => {
    entityManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as any;

    dataSource = {
      transaction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        {
          provide: getRepositoryToken(Sale),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Reservation),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Seat),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publishEvent: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            del: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    saleRepository = module.get(getRepositoryToken(Sale));

    rabbitMQService = module.get(RabbitMQService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('confirmPayment', () => {
    const confirmPaymentDto = {
      reservationId: 'reservation-123',
      paymentId: 'payment-123',
    };

    it('should throw NotFoundException if reservation does not exist', async () => {
      entityManager.findOne.mockResolvedValue(null);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(NotFoundException);
      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(
        'Reserva não encontrada',
      );
    });

    it('should throw BadRequestException if reservation is not pending', async () => {
      const confirmedReservation = {
        ...mockReservation,
        status: ReservationStatus.CONFIRMED,
      };

      entityManager.findOne.mockResolvedValue(confirmedReservation);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(BadRequestException);
      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(
        'Reserva não está pendente',
      );
    });

    it('should throw BadRequestException if reservation is expired', async () => {
      const expiredReservation = {
        ...mockReservation,
        expiresAt: new Date(Date.now() - 1000),
      };

      entityManager.findOne.mockResolvedValue(expiredReservation);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow(BadRequestException);
      await expect(service.confirmPayment(confirmPaymentDto)).rejects.toThrow('Reserva expirou');
    });

    it('should confirm payment successfully and publish event', async () => {
      const reservation = { ...mockReservation };
      const sale = { ...mockSale };

      entityManager.findOne.mockResolvedValue(reservation);
      entityManager.create.mockReturnValue(sale as any);
      entityManager.save.mockImplementation(async (entity) => entity);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      const result = await service.confirmPayment(confirmPaymentDto);

      expect(result).toEqual(sale);
      expect(entityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ReservationStatus.CONFIRMED,
        }),
      );
      expect(entityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SeatStatus.SOLD,
        }),
      );
      expect(entityManager.create).toHaveBeenCalledWith(Sale, {
        userId: 'user-123',
        seatId: 'seat-123',
        amount: 25.0,
        reservationId: 'reservation-123',
        paymentId: 'payment-123',
      });
      expect(redisService.del).toHaveBeenCalledWith('reservation:reservation-123');
      expect(rabbitMQService.publishEvent).toHaveBeenCalledWith('payment.confirmed', {
        saleId: sale.id,
        reservationId: 'reservation-123',
        seatId: 'seat-123',
        userId: 'user-123',
        amount: 25.0,
      });
    });
  });

  describe('findByUser', () => {
    it('should return sales for a user', async () => {
      const sales = [mockSale, { ...mockSale, id: 'sale-456' }];
      saleRepository.find.mockResolvedValue(sales as Sale[]);

      const result = await service.findByUser('user-123');

      expect(result).toEqual(sales);
      expect(saleRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        relations: ['seat', 'seat.session'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array if user has no sales', async () => {
      saleRepository.find.mockResolvedValue([]);

      const result = await service.findByUser('user-456');

      expect(result).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should return all sales', async () => {
      const sales = [mockSale, { ...mockSale, id: 'sale-456' }];
      saleRepository.find.mockResolvedValue(sales as Sale[]);

      const result = await service.findAll();

      expect(result).toEqual(sales);
      expect(saleRepository.find).toHaveBeenCalledWith({
        relations: ['seat', 'seat.session'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array if no sales exist', async () => {
      saleRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
