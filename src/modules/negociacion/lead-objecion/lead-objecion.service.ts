import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadObjecion } from '../../../entities/lead-objecion.entity.js';

@Injectable()
export class LeadObjecionService {
  constructor(
    @InjectRepository(LeadObjecion)
    private readonly repository: Repository<LeadObjecion>,
  ) {}

  findAll(): Promise<LeadObjecion[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<LeadObjecion> {
    const entity = await this.repository.findOne({
      where: { idLeadObjecion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`LeadObjecion con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<LeadObjecion>): Promise<LeadObjecion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<LeadObjecion>): Promise<LeadObjecion> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idLeadObjecion: id } as never);
  }
}
