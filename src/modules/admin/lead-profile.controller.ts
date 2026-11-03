import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AuthService, Public, type AdminRequest } from './auth.js';
import { LeadProfileService } from './lead-profile.service.js';
import {
  CaptureProfileService,
  contactCookie,
  cookieToken,
} from './capture-profile.service.js';
import {
  CaptureProfileDto,
  FollowUpDto,
  GeneralMeetingDto,
  ProfilePageDto,
  SuggestionDecisionDto,
  TesiBeginDto,
  TesiFinishDto,
  HandoffUpdateDto,
  QualificationReviewDto,
} from './lead-profile.dto.js';
import { AvailabilityDto } from './journeys.dto.js';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const id = (value: string) => {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new BadRequestException('ID inválido.');
  return value;
};
export function setContactCookie(res: Response, token: string) {
  res.cookie(contactCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86400000,
  });
}
@Controller('admin/leads')
@UsePipes(validation)
export class LeadProfileController {
  constructor(private readonly profiles: LeadProfileService) {}
  @Get(':id/conversaciones/:conversation/calificacion') qualification(@Param('id') lead: string, @Param('conversation') conversation: string) {
    return this.profiles.qualification(id(lead), id(conversation));
  }
  @Patch(':id/derivaciones/:handoff') handoff(@Param('id') lead: string, @Param('handoff') handoff: string, @Body() dto: HandoffUpdateDto, @Req() req: AdminRequest) {
    return this.profiles.handoff(id(lead), id(handoff), dto, req.admin.idUsuario);
  }
  @Post(':id/calificaciones/:evaluation/revision') review(@Param('id') lead: string, @Param('evaluation') evaluation: string, @Body() dto: QualificationReviewDto, @Req() req: AdminRequest) {
    return this.profiles.reviewQualification(id(lead), id(evaluation), dto, req.admin.idUsuario);
  }
  @Get('catalogos-perfil') catalogs() {
    return this.profiles.catalogos();
  }
  @Get(':id/interacciones') interactions(
    @Param('id') lead: string,
    @Query() dto: ProfilePageDto,
  ) {
    return this.profiles.interactions(id(lead), dto);
  }
  @Get(':id/conversaciones/:conversation/mensajes') messages(
    @Param('id') lead: string,
    @Param('conversation') conversation: string,
    @Query() dto: ProfilePageDto,
  ) {
    return this.profiles.messages(id(lead), id(conversation), dto);
  }
  @Post(':id/seguimientos') followUp(
    @Param('id') lead: string,
    @Body() dto: FollowUpDto,
    @Req() req: AdminRequest,
  ) {
    return this.profiles.followUp(id(lead), dto, req.admin.idUsuario);
  }
  @Patch(':id/seguimientos/:follow') update(
    @Param('id') lead: string,
    @Param('follow') follow: string,
    @Body() dto: FollowUpDto,
    @Req() req: AdminRequest,
  ) {
    return this.profiles.followUp(
      id(lead),
      dto,
      req.admin.idUsuario,
      id(follow),
    );
  }
  @Post(':id/sugerencias/:suggestion') decide(
    @Param('id') lead: string,
    @Param('suggestion') suggestion: string,
    @Body() dto: SuggestionDecisionDto,
    @Req() req: AdminRequest,
  ) {
    return this.profiles.decide(
      id(lead),
      id(suggestion),
      dto,
      req.admin.idUsuario,
    );
  }
}
@Controller('admin/conversaciones')
export class ConversationQualificationController {
  constructor(private readonly profiles: LeadProfileService) {}
  @Get(':conversation/calificacion') qualification(@Param('conversation') conversation: string) {
    return this.profiles.qualificationByConversation(id(conversation));
  }
}
@Public()
@Controller('captacion')
@UsePipes(validation)
export class CaptureProfileController {
  constructor(
    private readonly capture: CaptureProfileService,
    private readonly auth: AuthService,
  ) {}
  @Post('sesion') async session(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.checkOrigin(req);
    const s = await this.capture.open(cookieToken(req.headers.cookie));
    setContactCookie(res, s.token);
    return { ok: true };
  }
  @Post('perfiles') async profile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: CaptureProfileDto,
  ) {
    this.auth.checkOrigin(req);
    const result = await this.capture.capture(
      cookieToken(req.headers.cookie),
      dto,
    );
    setContactCookie(res, result.token);
    return { ok: true };
  }
  @Get('reuniones/disponibilidad') availability(@Query() dto: AvailabilityDto) {
    return this.capture.generalAvailability(dto.fecha);
  }
  @Post('reuniones') async meeting(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: GeneralMeetingDto,
  ) {
    this.auth.checkOrigin(req);
    const result = await this.capture.book(
      cookieToken(req.headers.cookie),
      dto,
    );
    setContactCookie(res, result.token);
    return { ok: true, fechaInicio: result.fechaInicio };
  }
}
@Public()
@Controller('internal/tesi')
@UsePipes(validation)
export class TesiProfileController {
  constructor(private readonly capture: CaptureProfileService) {}
  private authorized(req: Request) {
    const secret = process.env.CRM_BRIDGE_SECRET || '';
    const provided = String(req.headers['x-crm-secret'] || '');
    const hash = (s: string) => createHash('sha256').update(s).digest();
    if (secret.length < 32 || !timingSafeEqual(hash(secret), hash(provided)))
      throw new UnauthorizedException('Integración no autorizada.');
  }
  @Post('begin') begin(@Req() req: Request, @Body() dto: TesiBeginDto) {
    this.authorized(req);
    return this.capture.begin(cookieToken(req.headers.cookie), dto);
  }
  @Post('finish') finish(@Req() req: Request, @Body() dto: TesiFinishDto) {
    this.authorized(req);
    return this.capture.finish(cookieToken(req.headers.cookie), dto);
  }
  @Post('reset') reset(@Req() req: Request) {
    this.authorized(req);
    return this.capture.reset(cookieToken(req.headers.cookie));
  }
}
