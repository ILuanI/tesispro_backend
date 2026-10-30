import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KpiMedicion } from '../../../entities/kpi-medicion.entity.js';

@Injectable()
export class KpiMedicionService {
  constructor(
    @InjectRepository(KpiMedicion)
    private readonly repository: Repository<KpiMedicion>,
  ) {}

  findAll(): Promise<KpiMedicion[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<KpiMedicion> {
    const entity = await this.repository.findOne({
      where: { idMedicion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`KpiMedicion con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<KpiMedicion>): Promise<KpiMedicion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<KpiMedicion>): Promise<KpiMedicion> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idMedicion: id } as never);
  }
}
