import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DerivacionHumana } from '../../../entities/derivacion-humana.entity.js';

@Injectable()
export class DerivacionHumanaService {
  constructor(
    @InjectRepository(DerivacionHumana)
    private readonly repository: Repository<DerivacionHumana>,
  ) {}

  findAll(): Promise<DerivacionHumana[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<DerivacionHumana> {
    const entity = await this.repository.findOne({
      where: { idDerivacion: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`DerivacionHumana con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<DerivacionHumana>): Promise<DerivacionHumana> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<DerivacionHumana>): Promise<DerivacionHumana> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idDerivacion: id } as never);
  }
}
