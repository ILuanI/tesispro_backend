import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentRoles, type AdminRequest } from './auth.js';
import {
  PaymentVerificationService,
  type PaymentUpload,
} from './payment-verification.service.js';
import {
  PaymentDecisionDto,
  PaymentListDto,
  RectificationDto,
} from './payment-verification.dto.js';
export const paymentFile = () =>
  FileInterceptor('archivo', {
    limits: { fileSize: 10485760, files: 1, fields: 12, fieldSize: 20000 },
  });
@Controller('admin/pagos')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PaymentVerificationController {
  constructor(private readonly service: PaymentVerificationService) {}
  @Get('catalogos')
  @PaymentRoles('administrador', 'asesor_comercial')
  catalog() {
    return this.service.catalog();
  }
  @Get('titulares')
  @PaymentRoles('administrador', 'asesor_comercial')
  holders() {
    return this.service.holders();
  }
  @Get('titulares/:id/contratos')
  @PaymentRoles('administrador', 'asesor_comercial')
  contracts(@Param('id') id: string) {
    return this.service.contracts(id);
  }
  @Get('contratos/:id/cuotas')
  @PaymentRoles('administrador', 'asesor_comercial')
  installments(@Param('id', ParseIntPipe) id: number) {
    return this.service.installments(id);
  }
  @Get('rectificaciones')
  @PaymentRoles('administrador', 'asesor_comercial')
  rectifications() {
    return this.service.rectifications();
  }
  @Post('rectificaciones/:id/decision') decideRectification(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDecisionDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.decideRectification(id, dto, req.admin.idUsuario);
  }
  @Get('comprobantes/:id')
  @PaymentRoles('administrador', 'asesor_comercial')
  download(@Param('id', ParseIntPipe) id: number) {
    return this.service.download(id);
  }
  @Get() @PaymentRoles('administrador', 'asesor_comercial') list(
    @Query() dto: PaymentListDto,
  ) {
    return this.service.list(dto);
  }
  @Get(':id') @PaymentRoles('administrador', 'asesor_comercial') detail(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.detail(id);
  }
  @Post(':id/decision') decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentDecisionDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.decide(id, dto, req.admin.idUsuario);
  }
  @Post(':id/comprobantes')
  @PaymentRoles('asesor_comercial')
  @UseInterceptors(paymentFile())
  evidence(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: PaymentUpload,
    @Req() req: AdminRequest,
  ) {
    return this.service.addEvidence(id, file, req.admin.idUsuario);
  }
  @Post(':id/regularizacion') @PaymentRoles('asesor_comercial') regularize(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RectificationDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.regularize(id, dto, req.admin.idUsuario);
  }
  @Post(':id/rectificaciones') @PaymentRoles('asesor_comercial') rectify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RectificationDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.requestRectification(id, dto, req.admin.idUsuario);
  }
}
