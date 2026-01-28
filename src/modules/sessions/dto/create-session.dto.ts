import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ example: 'Avatar 2', description: 'Título do filme' })
  @IsString()
  @IsNotEmpty()
  movieTitle: string;

  @ApiProperty({ example: 'Sala 1', description: 'Nome da sala' })
  @IsString()
  @IsNotEmpty()
  room: string;

  @ApiProperty({ example: '2024-01-30T19:00:00Z', description: 'Horário de início' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: 25.0, description: 'Preço do ingresso' })
  @IsNumber()
  @Min(0)
  ticketPrice: number;

  @ApiProperty({ example: 16, description: 'Quantidade de assentos', minimum: 16 })
  @IsInt()
  @Min(16)
  totalSeats: number;
}
