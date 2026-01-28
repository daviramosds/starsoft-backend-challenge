import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';

jest.mock('ioredis', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      setex: jest.fn(),
      disconnect: jest.fn(),
    })),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockRedisClient = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      setex: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RedisService,
          useFactory: (configService: ConfigService) => {
            const service = new RedisService(configService);
            (service as any).client = mockRedisClient;
            return service;
          },
          inject: [ConfigService],
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return 6379;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (service) {
      service.onModuleDestroy();
    }
  });

  describe('getClient', () => {
    it('should return the Redis client', () => {
      const client = service.getClient();
      expect(client).toBe(mockRedisClient);
    });
  });

  describe('acquireLock', () => {
    it('should return true when lock is acquired successfully', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.acquireLock('test-lock', 5);

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-lock', '1', 'EX', 5, 'NX');
    });

    it('should return false when lock already exists', async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const result = await service.acquireLock('test-lock', 5);

      expect(result).toBe(false);
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-lock', '1', 'EX', 5, 'NX');
    });

    it('should use correct TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await service.acquireLock('test-lock', 10);

      expect(mockRedisClient.set).toHaveBeenCalledWith('test-lock', '1', 'EX', 10, 'NX');
    });
  });

  describe('releaseLock', () => {
    it('should delete the lock key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.releaseLock('test-lock');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-lock');
    });
  });

  describe('setWithTTL', () => {
    it('should set key with TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await service.setWithTTL('test-key', 'test-value', 30);

      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key', 30, 'test-value');
    });
  });

  describe('get', () => {
    it('should return value for existing key', async () => {
      mockRedisClient.get.mockResolvedValue('test-value');

      const result = await service.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('del', () => {
    it('should delete the key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect Redis client on module destroy', () => {
      service.onModuleDestroy();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });
});
