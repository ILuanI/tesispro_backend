import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProyectoNecesidad } from '../../../entities/proyecto-necesidad.entity.js';

@Injectable()
export class ProyectoNecesidadService {
  constructor(
    @InjectRepository(ProyectoNecesidad)
    private readonly repository: Repository<ProyectoNecesidad>,
  ) {}

  findAll(): Promise<ProyectoNecesidad[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<ProyectoNecesidad> {
    const entity = await this.repository.findOne({
      where: { idProyecto: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`ProyectoNecesidad con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<ProyectoNecesidad>): Promise<ProyectoNecesidad> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<ProyectoNecesidad>): Promise<ProyectoNecesidad> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idProyecto: id } as never);
  }
}
