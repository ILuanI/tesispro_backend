import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescargaRecurso } from '../../../entities/descarga-recurso.entity.js';

@Injectable()
export class DescargaRecursoService {
  constructor(
    @InjectRepository(DescargaRecurso)
    private readonly repository: Repository<DescargaRecurso>,
  ) {}

  findAll(): Promise<DescargaRecurso[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<DescargaRecurso> {
    const entity = await this.repository.findOne({
      where: { idDescarga: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`DescargaRecurso con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<DescargaRecurso>): Promise<DescargaRecurso> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<DescargaRecurso>): Promise<DescargaRecurso> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idDescarga: id } as never);
  }
}
