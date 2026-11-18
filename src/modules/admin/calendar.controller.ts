import { BadRequestException, Body, ConflictException, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, ServiceUnavailableException, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public, type AdminRequest } from './auth.js';
import { CalendarService, calendarResult } from './calendar.service.js';
import { GoogleCalendarService, safeCalendarError } from './google-calendar.service.js';
import { CaptureProfileService } from './capture-profile.service.js';
import { CalendarConfigDto, CalendarCreateDto, CalendarMoveDto, CalendarRangeDto, CalendarMeetDto } from './calendar.dto.js';
import { AvailabilityDto } from './journeys.dto.js';

@Controller('admin/calendario')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class CalendarController {
  constructor(private readonly calendar: CalendarService, private readonly google: GoogleCalendarService,
    private readonly capture: CaptureProfileService, private readonly db: DataSource) {}
  @Get('google') status() { return this.google.status(); }
  @Post('google/conectar') connect(@Req() req: AdminRequest) { return this.google.authorize(req.admin.idUsuario); }
  @Post('google/configurar') async config(@Body() dto: CalendarConfigDto) {
    try { return await this.google.saveCalendar(dto.calendarId); }
    catch (e) { if (e instanceof BadRequestException) throw e; throw new ServiceUnavailableException(safeCalendarError(e)); }
  }
  @Get('eventos') events(@Query() dto: CalendarRangeDto) { return this.calendar.range(dto.desde, dto.hasta); }
  @Get('disponibilidad') availability(@Query() dto: AvailabilityDto) { return this.calendar.availability(dto.fecha); }
  @Post('actualizar') refresh() { return this.calendar.refresh(); }
  @Post('reuniones') async create(@Body() dto: CalendarCreateDto) {
    const [prior] = await this.db.query('SELECT * FROM reunion WHERE clave_idempotencia=$1', [dto.clave]);
    if (prior) {
      const [profile] = await this.db.query('SELECT despues=$2::jsonb AS same FROM evento_perfil WHERE clave=$1', [dto.clave, JSON.stringify(dto)]);
      if (!profile?.same) throw new ConflictException('La solicitud ya fue registrada con otros datos.');
      return this.calendar.confirm(prior.id_reunion);
    }
    const result = await this.capture.book('', dto);
    const { token: _privateToken, ...publicResult } = result;
    return publicResult;
  }
  @Post('reuniones/:id/reprogramar') move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CalendarMoveDto, @Req() req: AdminRequest) {
    return this.calendar.move(id, dto.fechaInicio, req.admin.idUsuario);
  }
  @Post('reuniones/:id/sincronizar') async sync(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    const [r] = await this.db.query('SELECT * FROM reunion WHERE id_reunion=$1', [id]);
    if (r?.pending_action) return this.calendar.execute(id);
    await this.calendar.prepare(id, 'link', {}, req.admin.idUsuario);
    return this.calendar.execute(id);
  }
  @Post('reuniones/:id/meet') async meet(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CalendarMeetDto) {
    const [r] = await this.db.query('SELECT * FROM reunion WHERE id_reunion=$1', [id]);
    if (!r?.external_event_id || r.estado !== 'confirmada' || r.pending_action) throw new BadRequestException('Selecciona una reunión confirmada y sincronizada.');
    const { api } = await this.google.client();
    try {
      await api.events.patch({ calendarId: r.google_calendar_id, eventId: r.external_event_id, sendUpdates: 'all',
        requestBody: { location: dto.meetUrl || undefined } }, { timeout: 8000 });
      await this.db.query('UPDATE reunion SET meet_url=$2,meet_status=$3,revision=revision+1 WHERE id_reunion=$1', [id, dto.meetUrl || null, 'manual']);
      return calendarResult({ ...r, meet_url: dto.meetUrl });
    } catch (e) { throw new ServiceUnavailableException(safeCalendarError(e)); }
  }
}

@Controller('integrations/google')
export class GoogleCalendarCallbackController {
  constructor(private readonly google: GoogleCalendarService) {}
  @Public()
  @Get('callback') async callback(@Query('state') state: string, @Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    // Return to a configured destination, never to a URL supplied by the visitor.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    try {
      await this.google.callback(state, code, error);
      if (process.env.CALENDAR_ADMIN_URL) return res.redirect(303, process.env.CALENDAR_ADMIN_URL);
      return res.type('text/plain').send('Google conectado. Vuelve al panel Calendario y configura el ID de Citas Tesispro.');
    } catch (e) {
      return res.status(400).type('text/plain').send(e instanceof BadRequestException ? e.message : safeCalendarError(e));
    }
  }
}
