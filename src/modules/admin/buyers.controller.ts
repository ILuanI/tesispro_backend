import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, Public, type AdminRequest } from './auth.js';
import { BuyerDto, BuyerListDto, CaptureBuyerDto } from './buyers.dto.js';
import { BuyersService } from './buyers.service.js';
import { ReferralsService, referralCookie } from './referrals.service.js';
import { ProfilePageDto } from './lead-profile.dto.js';
function buyerId(id: string) {
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new BadRequestException('ID inválido.');
  return id;
}
@Controller('admin/buyers')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class BuyersController {
  constructor(private readonly service: BuyersService) {}
  @Get('catalogos') catalogos() {
    return this.service.catalogos();
  }
  @Get('origen-lead/:id') origin(@Param('id') id: string) {
    return this.service.leadOrigin(buyerId(id));
  }
  @Get() list(@Query() dto: BuyerListDto) {
    return this.service.list(dto);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.service.detail(buyerId(id));
  }
  @Get(':id/interacciones') interactions(@Param('id') id: string, @Query() dto: ProfilePageDto) {
    return this.service.interactions(buyerId(id), dto);
  }
  @Post() create(@Body() dto: BuyerDto, @Req() req: AdminRequest) {
    return this.service.save(dto, req.admin.idUsuario);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() dto: BuyerDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.save(dto, req.admin.idUsuario, buyerId(id));
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(buyerId(id));
  }
}
@Controller('captacion/buyers')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CaptureBuyersController {
  constructor(
    private readonly service: BuyersService,
    private readonly auth: AuthService,
    private readonly referrals: ReferralsService,
  ) {}
  @Public() @Post() capture(@Body() dto: CaptureBuyerDto, @Req() req: Request) {
    this.auth.checkOrigin(req);
    if (referralCookie(req)) this.referrals.limit(req.ip || 'unknown');
    return this.service.capture(dto, referralCookie(req));
  }
}
