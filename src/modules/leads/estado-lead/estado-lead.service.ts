import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoLead } from '../../../entities/estado-lead.entity.js';

@Injectable()
export class EstadoLeadService {
  constructor(
    @InjectRepository(EstadoLead)
    private readonly repository: Repository<EstadoLead>,
  ) {}

  findAll(): Promise<EstadoLead[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<EstadoLead> {
    const entity = await this.repository.findOne({
      where: { idEstado: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`EstadoLead con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<EstadoLead>): Promise<EstadoLead> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<EstadoLead>): Promise<EstadoLead> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idEstado: id } as never);
  }
}
