import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pago } from '../../../entities/pago.entity.js';

@Injectable()
export class PagoService {
  constructor(
    @InjectRepository(Pago)
    private readonly repository: Repository<Pago>,
  ) {}

  findAll(): Promise<Pago[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<Pago> {
    const entity = await this.repository.findOne({
      where: { idPago: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`Pago con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<Pago>): Promise<Pago> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<Pago>): Promise<Pago> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idPago: id } as never);
  }
}
