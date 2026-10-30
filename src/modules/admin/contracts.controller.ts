import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ContractsService } from './contracts.service.js';
import { CreateContractDto, UpdateContractDto } from './contracts.dto.js';
import type { AdminRequest } from './auth.js';

@Controller('admin/contratos')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}
  @Get('catalogos') catalogos() {
    return this.contracts.catalogos();
  }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.detail(id);
  }
  @Post() create(@Body() dto: CreateContractDto, @Req() req: AdminRequest) {
    return this.contracts.create(dto, req.admin.idUsuario);
  }
  @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(id, dto);
  }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.remove(id);
  }
}
