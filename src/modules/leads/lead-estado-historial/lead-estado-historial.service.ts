import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadEstadoHistorial } from '../../../entities/lead-estado-historial.entity.js';

@Injectable()
export class LeadEstadoHistorialService {
  constructor(
    @InjectRepository(LeadEstadoHistorial)
    private readonly repository: Repository<LeadEstadoHistorial>,
  ) {}

  findAll(): Promise<LeadEstadoHistorial[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<LeadEstadoHistorial> {
    const entity = await this.repository.findOne({
      where: { idHistorial: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`LeadEstadoHistorial con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<LeadEstadoHistorial>): Promise<LeadEstadoHistorial> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<LeadEstadoHistorial>): Promise<LeadEstadoHistorial> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idHistorial: id } as never);
  }
}
