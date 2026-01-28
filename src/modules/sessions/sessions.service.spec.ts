import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Session, SeatStatus } from '@/entities';
import { NotFoundException } from '@nestjs/common';

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepository: jest.Mocked<Repository<Session>>;

  const mockSession: Partial<Session> = {
    id: 'session-123',
    movieTitle: 'Test Movie',
    room: 'Room 1',
    startTime: new Date('2024-12-31T20:00:00Z'),
    ticketPrice: 25.0,
    totalSeats: 16,
    availableSeats: 16,
    seats: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(Session),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    sessionRepository = module.get(getRepositoryToken(Session));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createSessionDto = {
      movieTitle: 'Test Movie',
      room: 'Room 1',
      startTime: '2024-12-31T20:00:00Z',
      ticketPrice: 25.0,
      totalSeats: 16,
    };

    it('should create a session with correct number of seats', async () => {
      const sessionWithSeats = {
        ...mockSession,
        seats: Array.from({ length: 16 }, (_, i) => ({
          id: `seat-${i}`,
          seatNumber: `A${i + 1}`,
          status: SeatStatus.AVAILABLE,
        })),
      };

      sessionRepository.create.mockReturnValue(sessionWithSeats as any);
      sessionRepository.save.mockResolvedValue(sessionWithSeats as any);

      const result = await service.create(createSessionDto);

      expect(sessionRepository.create).toHaveBeenCalledWith({
        movieTitle: 'Test Movie',
        room: 'Room 1',
        startTime: new Date('2024-12-31T20:00:00Z'),
        ticketPrice: 25.0,
        totalSeats: 16,
        availableSeats: 16,
      });

      expect(result.seats).toHaveLength(16);
      expect(result.seats[0].seatNumber).toBe('A1');
      expect(result.seats[15].seatNumber).toBe('A16');
    });

    it('should create seats with correct status', async () => {
      const sessionWithSeats = {
        ...mockSession,
        seats: [
          {
            id: 'seat-1',
            seatNumber: 'A1',
            status: SeatStatus.AVAILABLE,
          },
        ],
      };

      sessionRepository.create.mockReturnValue(sessionWithSeats as any);
      sessionRepository.save.mockResolvedValue(sessionWithSeats as any);

      const result = await service.create(createSessionDto);

      expect(result.seats[0].status).toBe(SeatStatus.AVAILABLE);
    });
  });

  describe('findAll', () => {
    it('should return all sessions with seats', async () => {
      const sessions = [
        { ...mockSession, id: 'session-1' },
        { ...mockSession, id: 'session-2' },
      ];

      sessionRepository.find.mockResolvedValue(sessions as Session[]);

      const result = await service.findAll();

      expect(result).toEqual(sessions);
      expect(sessionRepository.find).toHaveBeenCalledWith({
        relations: ['seats'],
        order: { startTime: 'ASC' },
      });
    });

    it('should return empty array if no sessions exist', async () => {
      sessionRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return session by id', async () => {
      sessionRepository.findOne.mockResolvedValue(mockSession as Session);

      const result = await service.findOne('session-123');

      expect(result).toEqual(mockSession);
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'session-123' },
        relations: ['seats'],
      });
    });

    it('should throw NotFoundException if session does not exist', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableSeats', () => {
    it('should return only available seats', async () => {
      const sessionWithMixedSeats = {
        ...mockSession,
        seats: [
          { id: 'seat-1', seatNumber: 'A1', status: SeatStatus.AVAILABLE },
          { id: 'seat-2', seatNumber: 'A2', status: SeatStatus.RESERVED },
          { id: 'seat-3', seatNumber: 'A3', status: SeatStatus.AVAILABLE },
          { id: 'seat-4', seatNumber: 'A4', status: SeatStatus.SOLD },
        ],
      };

      sessionRepository.findOne.mockResolvedValue(sessionWithMixedSeats as any);

      const result = await service.getAvailableSeats('session-123');

      expect(result).toHaveLength(2);
      expect(result[0].seatNumber).toBe('A1');
      expect(result[1].seatNumber).toBe('A3');
      expect(result.every((seat) => seat.status === SeatStatus.AVAILABLE)).toBe(true);
    });

    it('should return empty array if no available seats', async () => {
      const sessionWithNoAvailableSeats = {
        ...mockSession,
        seats: [
          { id: 'seat-1', seatNumber: 'A1', status: SeatStatus.SOLD },
          { id: 'seat-2', seatNumber: 'A2', status: SeatStatus.RESERVED },
        ],
      };

      sessionRepository.findOne.mockResolvedValue(sessionWithNoAvailableSeats as any);

      const result = await service.getAvailableSeats('session-123');

      expect(result).toEqual([]);
    });

    it('should return empty array if session does not exist', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.getAvailableSeats('non-existent');

      expect(result).toEqual([]);
    });
  });
});
