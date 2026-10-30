import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DirectivaTesis } from '../../../entities/directiva-tesis.entity.js';

@Injectable()
export class DirectivaTesisService {
  constructor(
    @InjectRepository(DirectivaTesis)
    private readonly repository: Repository<DirectivaTesis>,
  ) {}

  findAll(): Promise<DirectivaTesis[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<DirectivaTesis> {
    const entity = await this.repository.findOne({
      where: { idDirectiva: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`DirectivaTesis con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<DirectivaTesis>): Promise<DirectivaTesis> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<DirectivaTesis>): Promise<DirectivaTesis> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idDirectiva: id } as never);
  }
}
