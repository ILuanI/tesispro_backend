import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mensaje } from '../../../entities/mensaje.entity.js';

@Injectable()
export class MensajeService {
  constructor(
    @InjectRepository(Mensaje)
    private readonly repository: Repository<Mensaje>,
  ) {}

  findAll(): Promise<Mensaje[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Mensaje> {
    const entity = await this.repository.findOne({
      where: { idMensaje: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Mensaje con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Mensaje>): Promise<Mensaje> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Mensaje>): Promise<Mensaje> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idMensaje: id } as never);
  }
}
