import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Public, type AdminRequest } from './auth.js';
import {
  DeliveryDto,
  PaymentModeDto,
  ScheduleActionDto,
} from './payment-schedules.dto.js';
import { PaymentSchedulesService } from './payment-schedules.service.js';

@Controller()
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PaymentSchedulesController {
  constructor(private readonly service: PaymentSchedulesService) {}
  @Public() @Get('public/modalidades-pago') publicModes() {
    return this.service.modes(true);
  }
  @Get('admin/modalidades-pago') modes() {
    return this.service.modes();
  }
  @Patch('admin/modalidades-pago/:id') mode(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentModeDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveMode(id, dto, req.admin.idUsuario);
  }
  @Get('admin/contratos/:id/cronograma/versiones') versions(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.detail(id);
  }
  @Post('admin/contratos/:id/cronograma/versiones/:version/acciones') action(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: ScheduleActionDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.action(id, version, dto, req.admin.idUsuario);
  }
  @Patch('admin/cuotas/:id/entregables/:indice') delivery(
    @Param('id', ParseIntPipe) id: number,
    @Param('indice', ParseIntPipe) index: number,
    @Body() dto: DeliveryDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.delivery(id, index, dto.estado, req.admin.idUsuario);
  }
}
