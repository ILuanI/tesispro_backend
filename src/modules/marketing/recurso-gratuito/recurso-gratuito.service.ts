import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecursoGratuito } from '../../../entities/recurso-gratuito.entity.js';

@Injectable()
export class RecursoGratuitoService {
  constructor(
    @InjectRepository(RecursoGratuito)
    private readonly repository: Repository<RecursoGratuito>,
  ) {}

  findAll(): Promise<RecursoGratuito[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<RecursoGratuito> {
    const entity = await this.repository.findOne({
      where: { idRecurso: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`RecursoGratuito con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<RecursoGratuito>): Promise<RecursoGratuito> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<RecursoGratuito>): Promise<RecursoGratuito> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idRecurso: id } as never);
  }
}
