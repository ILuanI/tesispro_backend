import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerfilAcademico } from '../../../entities/perfil-academico.entity.js';

@Injectable()
export class PerfilAcademicoService {
  constructor(
    @InjectRepository(PerfilAcademico)
    private readonly repository: Repository<PerfilAcademico>,
  ) {}

  findAll(): Promise<PerfilAcademico[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<PerfilAcademico> {
    const entity = await this.repository.findOne({
      where: { idPerfil: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`PerfilAcademico con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<PerfilAcademico>): Promise<PerfilAcademico> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<PerfilAcademico>): Promise<PerfilAcademico> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPerfil: id } as never);
  }
}
