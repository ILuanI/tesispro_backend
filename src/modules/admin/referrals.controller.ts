import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, Public } from './auth.js';
import {
  EnableReferralDto,
  ReferralCodeDto,
  ReferralListDto,
  ReferralStatusDto,
} from './referrals.dto.js';
import { ReferralsService, referralCookie } from './referrals.service.js';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('admin/referidos')
@UsePipes(validation)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get() list(@Query() dto: ReferralListDto) {
    return this.referrals.list(dto);
  }
  @Get('resumen') summary() {
    return this.referrals.summary();
  }
  @Get('clientes') clients(@Query() dto: ReferralListDto) {
    return this.referrals.clients(dto.q);
  }
  @Post() enable(@Body() dto: EnableReferralDto) {
    return this.referrals.enable(dto.idCliente);
  }
  @Patch(':id/estado') status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReferralStatusDto,
  ) {
    return this.referrals.status(id, dto.activo);
  }
  @Get('origen/:kind/:id') origin(
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    if (
      !['buyer', 'lead'].includes(kind) ||
      !/^[1-9]\d{0,18}$/.test(id) ||
      BigInt(id) > 9223372036854775807n
    )
      throw new BadRequestException('Identificador de contacto inválido.');
    return this.referrals.origin(kind as 'buyer' | 'lead', id);
  }
  @Get(':id/historial') history(
    @Param('id', ParseIntPipe) id: number,
    @Query() dto: ReferralListDto,
  ) {
    return this.referrals.history(id, dto);
  }
}
@Public()
@Controller('public/referidos')
@UsePipes(validation)
export class PublicReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly auth: AuthService,
  ) {}
  @Post('contexto') context(
    @Body() dto: ReferralCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.checkOrigin(req);
    this.referrals.limit(req.ip || 'unknown');
    return this.referrals.establish(dto.codigo, referralCookie(req), res);
  }
}
