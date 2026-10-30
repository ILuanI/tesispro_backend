import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KpiDefinicion } from '../../../entities/kpi-definicion.entity.js';

@Injectable()
export class KpiDefinicionService {
  constructor(
    @InjectRepository(KpiDefinicion)
    private readonly repository: Repository<KpiDefinicion>,
  ) {}

  findAll(): Promise<KpiDefinicion[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<KpiDefinicion> {
    const entity = await this.repository.findOne({
      where: { idKpi: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`KpiDefinicion con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<KpiDefinicion>): Promise<KpiDefinicion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<KpiDefinicion>): Promise<KpiDefinicion> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idKpi: id } as never);
  }
}
