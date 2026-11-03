import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AdminRequest } from './auth.js';
import { CommercialServiceDto, ProposalActionDto, ProposalDraftDto, OptionalComponentsDto, IncompatibilityDto } from './commercial-proposal.dto.js';
import { CommercialProposalService } from './commercial-proposal.service.js';

@Controller('admin/propuestas-comerciales')
@UsePipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}))
export class CommercialProposalController {
  constructor(private readonly proposals: CommercialProposalService) {}
  @Get('catalogo') catalog() { return this.proposals.catalog(); }
  @Put('catalogo/servicios/:id') configure(@Param('id',ParseIntPipe) id:number,@Body() dto:CommercialServiceDto,@Req() req:AdminRequest) { return this.proposals.configure(id,dto,req.admin.idUsuario); }
  @Put('catalogo/paquetes/:id/opcionales') optional(@Param('id',ParseIntPipe) id:number,@Body() dto:OptionalComponentsDto) { return this.proposals.optional(id,dto.servicios); }
  @Put('catalogo/incompatibilidad') incompatibility(@Body() dto:IncompatibilityDto) { return this.proposals.incompatibility(dto.primero,dto.segundo,dto.incompatible); }
  @Post('lead/:lead') generate(@Param('lead') lead:string,@Body() dto:ProposalDraftDto,@Req() req:AdminRequest) { return this.proposals.generate(lead,dto,req.admin.idUsuario); }
  @Post('lead/:lead/recomendaciones') recommend(@Param('lead') lead:string) { return this.proposals.recommend(lead); }
  @Get(':id') detail(@Param('id') id:string) { return this.proposals.detail(id); }
  @Patch(':id/lead/:lead') regenerate(@Param('id') id:string,@Param('lead') lead:string,@Body() dto:ProposalDraftDto,@Req() req:AdminRequest) { return this.proposals.generate(lead,dto,req.admin.idUsuario,id); }
  @Post(':id/acciones') action(@Param('id') id:string,@Body() dto:ProposalActionDto,@Req() req:AdminRequest) { return this.proposals.action(id,dto,req.admin.idUsuario); }
}
