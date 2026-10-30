import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Propuesta } from '../../../entities/propuesta.entity.js';

@Injectable()
export class PropuestaService {
  constructor(
    @InjectRepository(Propuesta)
    private readonly repository: Repository<Propuesta>,
  ) {}

  findAll(): Promise<Propuesta[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Propuesta> {
    const entity = await this.repository.findOne({
      where: { idPropuesta: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Propuesta con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Propuesta>): Promise<Propuesta> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Propuesta>): Promise<Propuesta> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPropuesta: id } as never);
  }
}
