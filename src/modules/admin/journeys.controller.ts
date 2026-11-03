import { CaptureProfileService, cookieToken } from './capture-profile.service.js';
import { setContactCookie } from './lead-profile.controller.js';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, Public, type AdminRequest } from './auth.js';
import { ReferralsService, referralCookie } from './referrals.service.js';
import { JourneysService } from './journeys.service.js';
import {
  AttributionDto,
  AvailabilityDto,
  BookMeetingDto,
  CampaignLinkDto,
  CancelMeetingDto,
  JourneyListDto,
  MeetingListDto,
  ResourceContactDto,
} from './journeys.dto.js';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const token = (req: Request) => String(req.headers['x-resource-access'] || '');

@Public()
@Controller('public/recursos')
@UsePipes(validation)
export class PublicResourcesController {
  constructor(
    private readonly service: JourneysService,
    private readonly auth: AuthService,
    private readonly capture: CaptureProfileService,
    private readonly referrals: ReferralsService,
  ) {}
  @Get() list() {
    return this.service.publicResources();
  }
  @Get('acceso') state(@Req() req: Request) {
    return this.service.state(token(req));
  }
  @Post('contacto') async contact(
    @Req() req: Request,
    @Res({passthrough:true}) res:Response,
    @Body() dto: ResourceContactDto,
  ) {
    this.auth.checkOrigin(req);
    const referral = referralCookie(req);
    if (referral) this.referrals.limit(req.ip || 'unknown');
    const session=await this.capture.open(cookieToken(req.headers.cookie));
    await this.service.contact(token(req), dto, referral);
    await this.capture.linkResource(session.token,token(req));
    setContactCookie(res,session.token);
    return {ok:true};
  }
  @Post('opciones') options(@Req() req: Request) {
    this.auth.checkOrigin(req);
    return this.service.options(token(req));
  }
  @Post('agendar') start(@Req() req: Request) {
    this.auth.checkOrigin(req);
    return this.service.startMeeting(token(req));
  }
  @Post('externo') external(@Req() req: Request) {
    this.auth.checkOrigin(req);
    return this.service.external(token(req));
  }
  @Get('disponibilidad') availability(
    @Req() req: Request,
    @Query() dto: AvailabilityDto,
  ) {
    return this.service.availability(token(req), dto.fecha);
  }
  @Post('reservas') book(@Req() req: Request, @Body() dto: BookMeetingDto) {
    this.auth.checkOrigin(req);
    return this.service.book(token(req), dto);
  }
  @Post('descarga') async download(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.checkOrigin(req);
    const file = await this.service.download(token(req));
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!file.archivo_contenido)
      return { externo: true, url: file.archivo_url };
    res.once('finish', () => {
      if (res.statusCode === 200 || res.statusCode === 201)
        void this.service
          .delivered(file.idSolicitud)
          .catch(() =>
            console.error('No se pudo registrar la entrega del recurso.'),
          );
    });
    return new StreamableFile(file.archivo_contenido, {
      type: file.archivo_mime,
      length: file.archivo_contenido.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.archivo_nombre).replace(/'/g, '%27')}`,
    });
  }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.publicResource(id);
  }
  @Post(':id/visitas') visit(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttributionDto,
  ) {
    this.auth.checkOrigin(req);
    return this.service.visit(id, dto);
  }
}
@Public()
@Controller('r')
export class ResourceLinksController {
  constructor(private readonly service: JourneysService) {}
  @Get(':code') async redirect(
    @Param('code') code: string,
    @Res() res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.redirect(302, await this.service.redirect(code));
  }
}
@Controller('admin')
@UsePipes(validation)
export class JourneysAdminController {
  constructor(private readonly service: JourneysService) {}
  @Get('recursos/:id/enlaces') links(@Param('id', ParseIntPipe) id: number) {
    return this.service.links(id);
  }
  @Post('recursos/:id/enlaces') createLink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CampaignLinkDto,
  ) {
    return this.service.createLink(id, dto);
  }
  @Get('actividad/catalogos') catalogos() {
    return this.service.catalogos();
  }
  @Get('actividad') history(@Query() dto: JourneyListDto) {
    return this.service.history(dto);
  }
  @Get('reuniones') meetings(@Query() dto: MeetingListDto) {
    return this.service.meetings(dto);
  }
  @Post('reuniones/:id/cancelar') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMeetingDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.cancel(id, dto.motivo, req.admin.idUsuario);
  }
}
