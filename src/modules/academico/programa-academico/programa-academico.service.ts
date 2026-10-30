import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProgramaAcademico } from '../../../entities/programa-academico.entity.js';

@Injectable()
export class ProgramaAcademicoService {
  constructor(
    @InjectRepository(ProgramaAcademico)
    private readonly repository: Repository<ProgramaAcademico>,
  ) {}

  findAll(): Promise<ProgramaAcademico[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<ProgramaAcademico> {
    const entity = await this.repository.findOne({
      where: { idPrograma: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`ProgramaAcademico con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<ProgramaAcademico>): Promise<ProgramaAcademico> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<ProgramaAcademico>): Promise<ProgramaAcademico> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPrograma: id } as never);
  }
}
