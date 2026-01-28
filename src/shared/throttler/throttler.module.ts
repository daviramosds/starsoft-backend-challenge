import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule as NestThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service';
class RedisThrottlerStorage implements ThrottlerStorage {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
    this.client.on('error', (err) => console.warn('Redis throttler storage error:', err.message));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const pipe = this.client.pipeline();
      pipe.incr(key);
      pipe.ttl(key);
      const [[, totalHits], [, ttlValue]] = await pipe.exec();

      if (ttlValue === -1) {
        await this.client.expire(key, Math.ceil(ttl / 1000));
      }

      return {
        totalHits: totalHits as number,
        timeToExpire: (ttlValue as number) > 0 ? (ttlValue as number) : Math.ceil(ttl / 1000),
        isBlocked: (totalHits as number) > limit,
        timeToBlockExpire: (totalHits as number) > limit ? blockDuration : 0,
      };
    } catch (error) {
      console.warn('Redis increment failed:', error.message);
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}

@Module({
  imports: [
    ConfigModule,
    NestThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, RedisService],
      useFactory: (configService: ConfigService, redisService: RedisService) => {
        return {
          throttlers: [
            {
              name: 'short',
              ttl: 1000, // 1 segundo
              limit: 1000, // Increased for testing
            },
            {
              name: 'medium',
              ttl: 60000, // 1 minuto
              limit: 10000, // Increased for testing
            },
            {
              name: 'long',
              ttl: 3600000, // 1 hora
              limit: 100000, // Increased for testing
            },
          ],
          storage: new RedisThrottlerStorage(redisService.getClient()),
        };
      },
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}
