import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsService } from './reservations.service';
import { Repository, DataSource, QueryRunner, EntityManager } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Reservation, Seat, SeatStatus, ReservationStatus } from '@/entities';
import { RedisService } from '@/shared/redis/redis.service';
import { RabbitMQService } from '@/shared/rabbitmq/rabbitmq.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let reservationRepository: jest.Mocked<Repository<Reservation>>;

  let redisService: jest.Mocked<RedisService>;
  let rabbitMQService: jest.Mocked<RabbitMQService>;

  let dataSource: jest.Mocked<DataSource>;
  let queryRunner: jest.Mocked<QueryRunner>;
  let entityManager: jest.Mocked<EntityManager>;

  const mockSeat: Partial<Seat> = {
    id: 'seat-123',
    seatNumber: 'A1',
    status: SeatStatus.AVAILABLE,
    version: 1,
  };

  const mockReservation: Partial<Reservation> = {
    id: 'reservation-123',
    userId: 'user-123',
    seatId: 'seat-123',
    requestId: 'request-123',
    status: ReservationStatus.PENDING,
    expiresAt: new Date(Date.now() + 30000),
  };

  beforeEach(async () => {
    entityManager = {
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    } as any;

    queryRunner = {
      manager: entityManager,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    } as any;

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      transaction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: getRepositoryToken(Reservation),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Seat),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            acquireLock: jest.fn(),
            releaseLock: jest.fn(),
            setWithTTL: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publishEvent: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(30),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    reservationRepository = module.get(getRepositoryToken(Reservation));

    redisService = module.get(RedisService);
    rabbitMQService = module.get(RabbitMQService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createReservationDto = {
      userId: 'user-123',
      seatId: 'seat-123',
      requestId: 'request-123',
    };

    it('should return existing reservation if requestId already processed (idempotency)', async () => {
      reservationRepository.findOne.mockResolvedValue(mockReservation as Reservation);

      const result = await service.create(createReservationDto);

      expect(result).toEqual(mockReservation);
      expect(reservationRepository.findOne).toHaveBeenCalledWith({
        where: { requestId: 'request-123' },
      });
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if lock cannot be acquired', async () => {
      reservationRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(false);

      await expect(service.create(createReservationDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createReservationDto)).rejects.toThrow(
        'Assento está sendo processado. Tente novamente.',
      );

      expect(redisService.acquireLock).toHaveBeenCalledWith('seat:lock:seat-123', 5);
    });

    it('should throw NotFoundException if seat does not exist', async () => {
      reservationRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(true);

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      entityManager.createQueryBuilder.mockReturnValue(queryBuilder as any);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      await expect(service.create(createReservationDto)).rejects.toThrow(NotFoundException);
      await expect(service.create(createReservationDto)).rejects.toThrow('Assento não encontrado');

      expect(redisService.releaseLock).toHaveBeenCalledWith('seat:lock:seat-123');
    });

    it('should throw ConflictException if seat is not available', async () => {
      const reservedSeat = { ...mockSeat, status: SeatStatus.RESERVED };

      reservationRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(true);

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(reservedSeat),
      };

      entityManager.createQueryBuilder.mockReturnValue(queryBuilder as any);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      await expect(service.create(createReservationDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createReservationDto)).rejects.toThrow(
        'Assento não está disponível',
      );

      expect(redisService.releaseLock).toHaveBeenCalledWith('seat:lock:seat-123');
    });

    it('should create reservation successfully and publish event', async () => {
      const seat = { ...mockSeat };
      const reservation = { ...mockReservation };

      reservationRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(true);

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(seat),
      };

      entityManager.createQueryBuilder.mockReturnValue(queryBuilder as any);
      entityManager.create.mockReturnValue(reservation as any);
      entityManager.save.mockResolvedValue(reservation as any);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          return callback(entityManager);
        },
      );

      const result = await service.create(createReservationDto);

      expect(result).toEqual(reservation);
      expect(entityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SeatStatus.RESERVED,
          version: 2,
        }),
      );
      expect(redisService.setWithTTL).toHaveBeenCalledWith(
        `reservation:${reservation.id}`,
        JSON.stringify(reservation),
        30,
      );
      expect(rabbitMQService.publishEvent).toHaveBeenCalledWith(
        'reservation.created',
        expect.objectContaining({
          reservationId: reservation.id,
          seatId: 'seat-123',
          userId: 'user-123',
          expiresAt: expect.any(Date),
        }),
      );
      expect(redisService.releaseLock).toHaveBeenCalledWith('seat:lock:seat-123');
    });
  });

  describe('findByUser', () => {
    it('should return reservations for a user', async () => {
      const reservations = [mockReservation, { ...mockReservation, id: 'reservation-456' }];
      reservationRepository.find.mockResolvedValue(reservations as Reservation[]);

      const result = await service.findByUser('user-123');

      expect(result).toEqual(reservations);
      expect(reservationRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        relations: ['seat'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array if user has no reservations', async () => {
      reservationRepository.find.mockResolvedValue([]);

      const result = await service.findByUser('user-456');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return reservation by id', async () => {
      reservationRepository.findOne.mockResolvedValue(mockReservation as Reservation);

      const result = await service.findOne('reservation-123');

      expect(result).toEqual(mockReservation);
      expect(reservationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'reservation-123' },
        relations: ['seat'],
      });
    });

    it('should throw NotFoundException if reservation does not exist', async () => {
      reservationRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('non-existent')).rejects.toThrow('Reserva não encontrada');
    });
  });
});
