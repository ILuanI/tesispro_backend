import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public, PaymentRoles, type AdminRequest } from '../admin/auth.js';
import { cookieToken } from '../admin/capture-profile.service.js';
import { AgentsService } from './agents.service.js';
import { AttentionService } from './attention.service.js';
import { AiService } from '../ai/ai.service.js';
import { askFaq, localAnswer, questionSchema } from '../ai/faq.js';

export function checkSecret(given:string, expected=process.env.CRM_BRIDGE_SECRET || '') {
  const hash=(s:string)=>createHash('sha256').update(s).digest();
  if(expected.length<32 || !timingSafeEqual(hash(given),hash(expected))) throw new UnauthorizedException('Integración no autorizada.');
}
@Public()
@Controller('internal/agents')
export class AgentsController {
  constructor(private readonly agents:AgentsService, private readonly ai:AiService) {}
  @Post('turn') @HttpCode(200) async turn(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    checkSecret(String(req.headers['x-crm-secret'] || ''));
    try {
      const response=await this.agents.turn(body,cookieToken(req.headers.cookie));
      if(response.status) res.status(response.status);
      return response;
    } catch(error) { if(error instanceof z.ZodError) throw new BadRequestException('Solicitud inválida.'); throw error; }
  }
  @Post('faq') @HttpCode(200) async faq(@Body() body:unknown,@Req() req:Request) {
    checkSecret(String(req.headers['x-crm-secret'] || ''));
    const input=questionSchema.safeParse(body);
    if(!input.success) throw new BadRequestException('Pregunta inválida.');
    // Respuestas instantáneas por reglas: no consultan la base de conocimiento ni la IA.
    const local=localAnswer(input.data.question);
    if(local) return local;
    const knowledge = await this.ai.knowledge.context('academico', true, randomUUID(), 'faq');
    return askFaq(input.data.question,this.ai.options(undefined, knowledge));
  }
  @Post('proposal') @HttpCode(200) proposal(@Body() body:unknown,@Req() req:Request) {
    checkSecret(String(req.headers['x-crm-secret'] || ''));
    return this.ai.proposal(body);
  }
}
@Controller('admin/agentes')
@PaymentRoles('administrador','asesor_comercial')
export class AttentionController {
  constructor(private readonly service:AttentionService) {}
  @Get() list() {return this.service.list();}
  @Post('solicitudes/:id') action(@Param('id') id:string,@Body() raw:unknown,@Req() req:AdminRequest) {
    const input=z.object({action:z.enum(['tomar','resolver','reanudar']),revision:z.number().int().positive()}).strict().safeParse(raw);
    if(!/^\d+$/.test(id)||!input.success) throw new BadRequestException('Acción inválida.');
    return this.service.action(id,input.data.action,input.data.revision,req.admin.idUsuario);
  }
  @Post('recordatorios/:id/revisar') review(@Param('id') id:string,@Req() req:AdminRequest) {
    if(!/^\d+$/.test(id)) throw new BadRequestException('ID inválido.');
    return this.service.review(id,req.admin.idUsuario);
  }
  @Post('recordatorios/generar') generate() {return this.service.generate();}
}
@Public()
@Controller('internal/agents/jobs')
export class AgentJobsController {
  constructor(private readonly service:AttentionService) {}
  @Post('reminders') run(@Req() req:Request) {
    checkSecret(String(req.headers.authorization || '').replace(/^Bearer /,''),process.env.AGENTS_JOB_SECRET || '');
    return this.service.generate();
  }
}
