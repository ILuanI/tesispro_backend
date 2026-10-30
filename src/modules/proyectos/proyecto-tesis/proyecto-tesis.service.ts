import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProyectoTesis } from '../../../entities/proyecto-tesis.entity.js';

@Injectable()
export class ProyectoTesisService {
  constructor(
    @InjectRepository(ProyectoTesis)
    private readonly repository: Repository<ProyectoTesis>,
  ) {}

  findAll(): Promise<ProyectoTesis[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<ProyectoTesis> {
    const entity = await this.repository.findOne({
      where: { idProyecto: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`ProyectoTesis con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<ProyectoTesis>): Promise<ProyectoTesis> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<ProyectoTesis>): Promise<ProyectoTesis> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idProyecto: id } as never);
  }
}
