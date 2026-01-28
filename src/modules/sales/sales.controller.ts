import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

@ApiTags('sales')
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('confirm-payment')
  @ApiOperation({ summary: 'Confirmar pagamento de uma reserva' })
  @ApiResponse({ status: 201, description: 'Pagamento confirmado, venda criada' })
  @ApiResponse({ status: 400, description: 'Reserva inválida ou expirada' })
  confirmPayment(@Body() confirmPaymentDto: ConfirmPaymentDto) {
    return this.salesService.confirmPayment(confirmPaymentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Buscar vendas por usuário' })
  @ApiResponse({ status: 200, description: 'Histórico de compras' })
  findByUser(@Query('userId') userId?: string) {
    if (userId) {
      return this.salesService.findByUser(userId);
    }
    return this.salesService.findAll();
  }
}
