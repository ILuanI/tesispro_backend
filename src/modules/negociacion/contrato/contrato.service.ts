import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato } from '../../../entities/contrato.entity.js';

@Injectable()
export class ContratoService {
  constructor(
    @InjectRepository(Contrato)
    private readonly repository: Repository<Contrato>,
  ) {}

  findAll(): Promise<Contrato[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Contrato> {
    const entity = await this.repository.findOne({
      where: { idContrato: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Contrato con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Contrato>): Promise<Contrato> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Contrato>): Promise<Contrato> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idContrato: id } as never);
  }
}
