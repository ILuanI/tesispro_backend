import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Servicio } from '../../../entities/servicio.entity.js';

@Injectable()
export class ServicioService {
  constructor(
    @InjectRepository(Servicio)
    private readonly repository: Repository<Servicio>,
  ) {}

  findAll(): Promise<Servicio[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Servicio> {
    const entity = await this.repository.findOne({
      where: { idServicio: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Servicio con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Servicio>): Promise<Servicio> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Servicio>): Promise<Servicio> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idServicio: id } as never);
  }
}
