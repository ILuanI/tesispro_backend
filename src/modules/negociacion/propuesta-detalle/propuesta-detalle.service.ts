import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropuestaDetalle } from '../../../entities/propuesta-detalle.entity.js';

@Injectable()
export class PropuestaDetalleService {
  constructor(
    @InjectRepository(PropuestaDetalle)
    private readonly repository: Repository<PropuestaDetalle>,
  ) {}

  findAll(): Promise<PropuestaDetalle[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<PropuestaDetalle> {
    const entity = await this.repository.findOne({
      where: { idDetalle: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`PropuestaDetalle con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<PropuestaDetalle>): Promise<PropuestaDetalle> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<PropuestaDetalle>): Promise<PropuestaDetalle> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idDetalle: id } as never);
  }
}
