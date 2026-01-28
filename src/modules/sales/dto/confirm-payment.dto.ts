import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPaymentDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID da reserva',
  })
  @IsUUID()
  reservationId: string;

  @ApiProperty({ example: 'payment-123', description: 'ID do pagamento' })
  @IsString()
  @IsNotEmpty()
  paymentId: string;
}
