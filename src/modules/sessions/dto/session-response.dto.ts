import { ApiProperty } from '@nestjs/swagger';
import { SeatStatus } from '@/entities';

export class SeatResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'A1' })
  seatNumber: string;

  @ApiProperty({ enum: SeatStatus, example: 'available' })
  status: SeatStatus;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  sessionId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ example: 0 })
  version: number;
}

export class SessionResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Avatar: O Caminho da Água' })
  movieTitle: string;

  @ApiProperty({ example: 'Sala 1' })
  room: string;

  @ApiProperty({ example: '2024-02-01T19:00:00Z' })
  startTime: Date;

  @ApiProperty({ example: 25.0 })
  ticketPrice: number;

  @ApiProperty({ example: 16 })
  totalSeats: number;

  @ApiProperty({ example: 16 })
  availableSeats: number;

  @ApiProperty({ type: [SeatResponseDto] })
  seats: SeatResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
