import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Public, type AdminRequest } from './auth.js';
import {
  PackageDto,
  PackageListDto,
  PackageStatusDto,
} from './packages.dto.js';
import { PackagesService } from './packages.service.js';
@Controller('admin/paquetes')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}
  @Get() list(@Query() dto: PackageListDto) {
    return this.packages.list(dto);
  }
  @Get('resumen') summary() {
    return this.packages.summary();
  }
  @Get('catalogos') catalogs() {
    return this.packages.catalogs();
  }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.packages.detail(id);
  }
  @Get(':id/historial') history(
    @Param('id', ParseIntPipe) id: number,
    @Query() dto: PackageListDto,
  ) {
    return this.packages.history(id, dto);
  }
  @Post() create(@Body() dto: PackageDto, @Req() req: AdminRequest) {
    return this.packages.save(dto, req.admin.idUsuario);
  }
  @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PackageDto,
    @Req() req: AdminRequest,
  ) {
    return this.packages.save(dto, req.admin.idUsuario, id);
  }
  @Patch(':id/estado') status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PackageStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.packages.status(
      id,
      dto.estado,
      dto.version,
      req.admin.idUsuario,
    );
  }
}
@Public()
@Controller('public/paquetes')
export class PublicPackagesController {
  constructor(private readonly packages: PackagesService) {}
  @Get() catalog() {
    return this.packages.authorized();
  }
}
