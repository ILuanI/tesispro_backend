import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradoAcademico } from '../../../entities/grado-academico.entity.js';

@Injectable()
export class GradoAcademicoService {
  constructor(
    @InjectRepository(GradoAcademico)
    private readonly repository: Repository<GradoAcademico>,
  ) {}

  findAll(): Promise<GradoAcademico[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<GradoAcademico> {
    const entity = await this.repository.findOne({
      where: { idGrado: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`GradoAcademico con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<GradoAcademico>): Promise<GradoAcademico> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<GradoAcademico>): Promise<GradoAcademico> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idGrado: id } as never);
  }
}
