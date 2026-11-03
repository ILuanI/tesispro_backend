import { UseInterceptors, UploadedFile } from '@nestjs/common';
import {
  PaymentVerificationService,
  type PaymentUpload,
} from './payment-verification.service.js';
import { paymentFile } from './payment-verification.controller.js';
import { PaymentRoles } from './auth.js';
import { PaymentDecisionDto } from './payment-verification.dto.js';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { SchedulePreviewDto } from './payment-schedules.dto.js';
import { AdminService } from './admin.service.js';
import {
  AbonoDto,
  CronogramaDto,
  KpiRangeDto,
  LeadDto,
  ListDto,
  PreviewDto,
  ResolverPagoDto,
} from './admin.dto.js';
import type { AdminRequest } from './auth.js';
import { ContractListDto } from './contracts.dto.js';

function leadId(id: string) {
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new BadRequestException('ID de lead inválido.');
  return id;
}
@Controller('admin')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly payments: PaymentVerificationService,
  ) {}
  @Get('catalogos') catalogos() {
    return this.service.catalogos();
  }
  @Get('resumen') resumen() {
    return this.service.resumen();
  }
  @Get('impulse-kpis') impulseKpis(@Query() dto: KpiRangeDto) {
    return this.service.impulseKpis(dto);
  }
  @Get('leads') leads(@Query() dto: ListDto) {
    return this.service.leads(dto);
  }
  @Get('leads/:id') lead(@Param('id') id: string) {
    return this.service.lead(leadId(id));
  }
  @Get('leads/:id/historial') historial(@Param('id') id: string) {
    return this.service.historial(leadId(id));
  }
  @Post('leads') crearLead(@Body() dto: LeadDto, @Req() req: AdminRequest) {
    return this.service.saveLead(dto, req.admin.idUsuario);
  }
  @Patch('leads/:id') editarLead(
    @Param('id') id: string,
    @Body() dto: LeadDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveLead(dto, req.admin.idUsuario, leadId(id));
  }
  @Get('contratos') contratos(@Query() dto: ContractListDto) {
    return this.service.contratos(dto);
  }
  @Get('contratos/:id/cronograma') cronograma(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cronograma(id);
  }
  @Post('contratos/:id/cronograma/preview') preview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SchedulePreviewDto,
  ) {
    return this.service.preview(id, dto);
  }
  @Post('contratos/:id/cronograma') crearCronograma(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CronogramaDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveCronograma(id, dto, req.admin.idUsuario);
  }
  @Patch('contratos/:id/cronograma') editarCronograma(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CronogramaDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.saveCronograma(id, dto, req.admin.idUsuario, true);
  }
  @Get('cuotas') cuotas(@Query() dto: ListDto) {
    return this.service.cuotas(dto);
  }
  @Get('cuotas/:id/abonos') abonos(@Param('id', ParseIntPipe) id: number) {
    return this.service.abonos(id);
  }
  @Post('cuotas/:id/abonos')
  @PaymentRoles('asesor_comercial')
  @UseInterceptors(paymentFile())
  addAbono(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AbonoDto,
    @UploadedFile() file: PaymentUpload | undefined,
    @Req() req: AdminRequest,
  ) {
    return this.payments.register(id, dto, req.admin.idUsuario, file);
  }
  @Patch('pagos-previos/:id') resolverPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDecisionDto,
    @Req() req: AdminRequest,
  ) {
    return this.payments.decide(id, dto, req.admin.idUsuario);
  }
}
