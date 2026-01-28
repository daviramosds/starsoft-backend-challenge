import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Session, Seat, Reservation, Sale } from '@/entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isTest = configService.get<string>('NODE_ENV') === 'test';
        const isDevelopment = configService.get<string>('NODE_ENV') === 'development';

        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          entities: [Session, Seat, Reservation, Sale],
          synchronize: isDevelopment || isTest,
          dropSchema: isTest, // Drop schema in test environment
          logging: isDevelopment,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
