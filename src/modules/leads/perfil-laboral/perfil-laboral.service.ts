import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerfilLaboral } from '../../../entities/perfil-laboral.entity.js';

@Injectable()
export class PerfilLaboralService {
  constructor(
    @InjectRepository(PerfilLaboral)
    private readonly repository: Repository<PerfilLaboral>,
  ) {}

  findAll(): Promise<PerfilLaboral[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<PerfilLaboral> {
    const entity = await this.repository.findOne({
      where: { idPerfilLaboral: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`PerfilLaboral con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<PerfilLaboral>): Promise<PerfilLaboral> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<PerfilLaboral>): Promise<PerfilLaboral> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPerfilLaboral: id } as never);
  }
}
