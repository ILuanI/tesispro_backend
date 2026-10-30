import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversacion } from '../../../entities/conversacion.entity.js';

@Injectable()
export class ConversacionService {
  constructor(
    @InjectRepository(Conversacion)
    private readonly repository: Repository<Conversacion>,
  ) {}

  findAll(): Promise<Conversacion[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Conversacion> {
    const entity = await this.repository.findOne({
      where: { idConversacion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Conversacion con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Conversacion>): Promise<Conversacion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Conversacion>): Promise<Conversacion> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idConversacion: id } as never);
  }
}
