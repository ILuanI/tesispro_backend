import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seguimiento } from '../../../entities/seguimiento.entity.js';

@Injectable()
export class SeguimientoService {
  constructor(
    @InjectRepository(Seguimiento)
    private readonly repository: Repository<Seguimiento>,
  ) {}

  findAll(): Promise<Seguimiento[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Seguimiento> {
    const entity = await this.repository.findOne({
      where: { idSeguimiento: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Seguimiento con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Seguimiento>): Promise<Seguimiento> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Seguimiento>): Promise<Seguimiento> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idSeguimiento: id } as never);
  }
}
