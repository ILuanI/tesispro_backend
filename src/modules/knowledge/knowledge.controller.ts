import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Body, Controller, Get, Param, Patch, Post, Req, Res, UnauthorizedException, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { Public, type AdminRequest } from '../admin/auth.js';
import { KnowledgeService } from './knowledge.service.js';
import type { KnowledgeAgent } from './knowledge.types.js';
class DraftDto {
  @IsInt() @Min(1) revision: number;
  @IsString() @MaxLength(20000) markdown: string;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(300, { each: true }) sources: string[];
}
class PublishDto {
  @IsInt() @Min(1) revision: number;
  @IsString() @Matches(/^[1-9]\d{0,18}$/) releaseId: string;
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}
class RestoreDto {
  @IsInt() @Min(1) revision: number;
  @IsString() @Matches(/^[1-9]\d{0,18}$/) versionId: string;
}
class ContextDto {
  @IsIn(['marketing','negociador','cobranza','academico','postventa']) agent: KnowledgeAgent;
  @IsOptional() @IsBoolean() faq = false;
  @IsOptional() @IsUUID() turnKey?: string;
  @IsIn(['faq','negotiation','proposal']) operation: string;
}
const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('admin/conocimiento')
@UsePipes(validation)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Get() list() { return this.knowledge.list(); }
  @Get(':slug') detail(@Param('slug') slug: string) { return this.knowledge.detail(slug); }
  @Patch(':slug/borrador') draft(@Param('slug') slug: string, @Body() dto: DraftDto, @Req() req: AdminRequest) {
    return this.knowledge.draft(slug, dto.revision, dto.markdown, dto.sources, req.admin.idUsuario);
  }
  @Post(':slug/publicar') publish(@Param('slug') slug: string, @Body() dto: PublishDto, @Req() req: AdminRequest) {
    return this.knowledge.publish(slug, dto.revision, dto.releaseId, dto.reason, req.admin.idUsuario);
  }
  @Post(':slug/restaurar') restore(@Param('slug') slug: string, @Body() dto: RestoreDto, @Req() req: AdminRequest) {
    return this.knowledge.restore(slug, dto.versionId, dto.revision, req.admin.idUsuario);
  }
  @Get(':slug/exportar') async download(@Param('slug') slug: string, @Res() res: Response) {
    const d = await this.knowledge.detail(slug);
    res.setHeader('Content-Disposition', `attachment; filename="${d.slug}.md"`);
    return res.type('text/markdown; charset=utf-8').send(d.published?.markdown || '');
  }
}
@Public()
@Controller('internal/knowledge')
@UsePipes(validation)
export class KnowledgeInternalController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Post('context') context(@Body() dto: ContextDto, @Req() req: Request) {
    const secret = process.env.CRM_BRIDGE_SECRET || '', given = String(req.headers['x-crm-secret'] || '');
    const hash = (s: string) => createHash('sha256').update(s).digest();
    if (secret.length < 32 || !timingSafeEqual(hash(secret), hash(given))) throw new UnauthorizedException('Integración no autorizada.');
    return this.knowledge.context(dto.agent, dto.faq, dto.turnKey || randomUUID(), dto.operation);
  }
}
