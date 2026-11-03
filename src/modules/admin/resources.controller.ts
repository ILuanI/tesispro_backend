import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ResourceDto,
  ResourceListDto,
  ResourceStatusDto,
} from './resources.dto.js';
import { ResourcesService, type ResourceUpload } from './resources.service.js';

const upload = () =>
  FileInterceptor('archivo', {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1,
      fields: 12,
      fieldSize: 20000,
    },
  });
@Controller('admin/recursos')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}
  @Get('catalogos') catalogos() {
    return this.service.catalogos();
  }
  @Get() list(@Query() dto: ResourceListDto) {
    return this.service.list(dto);
  }
  @Get(':id/archivo') download(@Param('id', ParseIntPipe) id: number) {
    return this.service.download(id);
  }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }
  @Post()
  @UseInterceptors(upload())
  create(@Body() dto: ResourceDto, @UploadedFile() file?: ResourceUpload) {
    return this.service.save(dto, file);
  }
  @Patch(':id/estado') status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResourceStatusDto,
  ) {
    return this.service.status(id, dto.activo);
  }
  @Patch(':id')
  @UseInterceptors(upload())
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResourceDto,
    @UploadedFile() file?: ResourceUpload,
  ) {
    return this.service.save(dto, file, id);
  }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
