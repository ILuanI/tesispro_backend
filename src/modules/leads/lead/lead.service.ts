import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../../entities/lead.entity.js';

@Injectable()
export class LeadService {
  constructor(
    @InjectRepository(Lead)
    private readonly repository: Repository<Lead>,
  ) {}

  findAll(): Promise<Lead[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Lead> {
    const entity = await this.repository.findOne({
      where: { idLead: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Lead con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Lead>): Promise<Lead> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Lead>): Promise<Lead> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idLead: id } as never);
  }
}
